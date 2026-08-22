import logging
from datetime import datetime, timezone
from typing import List, Optional
import asyncio

# Assuming we have a task for background refreshing
from app.tasks import refresh_city_pois_task
from app.schemas.scraper import Attraction

logger = logging.getLogger(__name__)

# Constants
STALE_TTL_DAYS = 180

async def get_attractions_for_city(city_name: str, mandatory_names: list[str] = None) -> List[dict]:
    """
    Retrieves POIs for a city using a Stale-While-Revalidate (SWR) pattern.
    
    1. Checks the local pgvector database.
    2. If missing, blocks and runs a fresh ingestion (Cache Miss).
    3. If present and < 180 days old, returns instantly (Cache Hit).
    4. If present but >= 180 days old, returns instantly AND triggers a background update (Stale-While-Revalidate).
    """
    city_name = city_name.strip().title()
    logger.info(f"Retrieving POIs for {city_name}...")
    
    # 1. Query the database (Mocked DB call)
    pois = await _query_db_for_city(city_name)
    
    # 2. Cache Miss
    if not pois:
        logger.warning(f"Cache miss for {city_name}. Blocking to fetch fresh data...")
        # Await the actual fetch synchronously (blocking the response until done)
        new_pois = await _fetch_and_store_pois(city_name, mandatory_names)
        return [poi.model_dump(mode='json') for poi in new_pois]
        
    # Check TTL of the first POI to determine freshness
    # Assumes all POIs for a city were ingested at roughly the same time
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
    
    # Fire off a Celery task to asynchronously refresh this city's POIs
    refresh_city_pois_task.delay(city_name)
    
    return [poi.model_dump(mode='json') for poi in pois]


# --- DB Operations --- #

from sqlalchemy import select
from app.db.session import async_session
from app.db.models import AttractionModel
from datetime import timezone

async def _query_db_for_city(city_name: str) -> List[Attraction]:
    """
    Queries the PostgreSQL database for POIs matching the given city.
    """
    async with async_session() as session:
        stmt = select(AttractionModel).where(AttractionModel.city == city_name)
        result = await session.execute(stmt)
        models = result.scalars().all()
        
        attractions = []
        for model in models:
            # Reconstruct Pydantic schema from the DB model
            # We enforce structure using **model.location etc., which are JSONB dicts
            attraction = Attraction(
                id=model.id,
                type="attraction",
                category=model.category,
                name=model.name,
                location=model.location,
                schedule=model.schedule,
                financials=model.financials,
                scoring=model.scoring,
                metadata=model.metadata_field
            )
            attractions.append(attraction)
            
        return attractions

async def _fetch_and_store_pois(city_name: str, mandatory_names: list[str] = None) -> List[Attraction]:
    """
    Invokes the Overpass API script logic, parses the POIs, and saves them to the DB.
    """
    # Import locally to avoid circular dependencies
    import sys
    import os
    sys.path.append(os.path.join(os.path.dirname(__file__), '../../scripts'))
    try:
        from seed_static_pois import fetch_pois_for_city, parse_osm_element_to_attraction
    except ImportError:
        logger.error("Could not import seed script")
        return []
        
    elements = await fetch_pois_for_city(city_name, limit=50, mandatory_names=mandatory_names)
    
    attractions = []
    db_models = []
    
    for el in elements:
        parsed = parse_osm_element_to_attraction(el)
        if parsed:
            attractions.append(parsed)
            # Create SQLAlchemy model for insertion
            db_model = AttractionModel(
                id=parsed.id,
                city=city_name,
                name=parsed.name,
                category=parsed.category,
                location=parsed.location.model_dump(mode='json'),
                schedule=parsed.schedule.model_dump(mode='json'),
                financials=parsed.financials.model_dump(mode='json'),
                scoring=parsed.scoring.model_dump(mode='json'),
                metadata_field=parsed.metadata.model_dump(mode='json')
            )
            db_models.append(db_model)
            
    # Save `db_models` to the PostgreSQL database
    async with async_session() as session:
        # Use merge or session.add depending on if we want to overwrite
        for model in db_models:
            await session.merge(model) # merge handles upserts if ID exists
        await session.commit()
        
    logger.info(f"Saved {len(attractions)} fresh POIs to the database for {city_name}.")
    
    return attractions
