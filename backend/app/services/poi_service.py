import logging
from datetime import datetime, timezone
from typing import List, Optional
import asyncio

from app.tasks import refresh_city_pois_task
from app.schemas.scraper import Attraction
from app.domain.interfaces.poi_repository import IPoiRepository
from app.adapters.repositories.sql_poi_repository import SqlPoiRepository

logger = logging.getLogger(__name__)

STALE_TTL_DAYS = 180

async def get_attractions_for_city(city_name: str, mandatory_names: list[str] = None, poi_repo: IPoiRepository = None) -> List[dict]:
    """
    Retrieves POIs for a city using a Stale-While-Revalidate (SWR) pattern.
    Uses Dependency Injection for the repository to allow in-memory testing.
    """
    if poi_repo is None:
        poi_repo = SqlPoiRepository()

    city_name = city_name.strip().title()
    logger.info(f"Retrieving POIs for {city_name}...")
    
    # 1. Query the repository
    pois = await poi_repo.find_by_city(city_name)
    
    # 2. Cache Miss
    if not pois:
        logger.warning(f"Cache miss for {city_name}. Blocking to fetch fresh data...")
        new_pois = await _fetch_and_store_pois(city_name, poi_repo, mandatory_names)
        return [poi.model_dump(mode='json') for poi in new_pois]
        
    first_poi_date = pois[0].metadata.scraped_at
    if first_poi_date.tzinfo is None:
        first_poi_date = first_poi_date.replace(tzinfo=timezone.utc)
        
    age_days = (datetime.now(timezone.utc) - first_poi_date).days
    
    # 3. Cache Hit (Fresh)
    if age_days <= STALE_TTL_DAYS:
        logger.info(f"Cache hit for {city_name} (Age: {age_days} days). Returning instantly.")
        return [poi.model_dump(mode='json') for poi in pois]
        
    # 4. Stale-While-Revalidate (Stale)
    logger.info(f"Stale data for {city_name} (Age: {age_days} days). Returning stale data and triggering background SWR refresh.")
    refresh_city_pois_task.delay(city_name)
    
    return [poi.model_dump(mode='json') for poi in pois]

async def _fetch_and_store_pois(city_name: str, poi_repo: IPoiRepository, mandatory_names: list[str] = None) -> List[Attraction]:
    """
    Invokes the Overpass API script logic, parses the POIs, and saves them via the repository port.
    """
    try:
        from scripts.seed_static_pois import fetch_pois_for_city, parse_osm_element_to_attraction
    except ImportError:
        logger.error("Could not import seed script")
        return []
        
    elements = await fetch_pois_for_city(city_name, limit=50, mandatory_names=mandatory_names)
    
    attractions = []
    for el in elements:
        parsed = parse_osm_element_to_attraction(el)
        if parsed:
            attractions.append(parsed)
            
    await poi_repo.save_all_for_city(city_name, attractions)
    return attractions
