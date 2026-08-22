import asyncio
import httpx
import logging
import json
from datetime import datetime
from app.schemas.scraper import (
    Attraction, Location, AttractionSchedule, 
    AttractionFinancials, Scoring, Metadata
)

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

OVERPASS_ENDPOINTS = [
    "http://overpass-api.de/api/interpreter",
    "https://lz4.overpass-api.de/api/interpreter",
    "https://z.overpass-api.de/api/interpreter",
    "https://overpass.kumi.systems/api/interpreter"
]

async def fetch_pois_for_city(city_name: str, limit: int = 50, mandatory_names: list[str] = None):
    """
    Fetches POIs for a given city from OSM using Overpass API.
    Uses 'out center' to get a single lat/lon coordinate even for ways/relations.
    """
    # Strict boundary using admin_level=8 (municipality)
    query = f"""
    [out:json][timeout:25];
    area["name"="{city_name}"]["admin_level"="8"]->.searchArea;
    (
      nwr["tourism"="museum"](area.searchArea);
      nwr["historic"~"monument|ruins|castle|archaeological_site"](area.searchArea);
      nwr["tourism"="attraction"](area.searchArea);
    );
    out center {limit};
    """
    
    logger.info(f"Querying Overpass API for {city_name} (limit {limit})...")
    
    headers = {
        "Accept": "application/json",
        "User-Agent": "Paladio-Static-Ingester/1.0"
    }
    
    timeout = httpx.Timeout(25.0, connect=15.0)
    
    data = None
    for endpoint in OVERPASS_ENDPOINTS:
        try:
            async with httpx.AsyncClient(timeout=timeout) as client:
                response = await client.post(endpoint, data={"data": query}, headers=headers)
                response.raise_for_status()
                data = response.json()
                break
        except Exception as e:
            continue
            
    if not data:
        raise RuntimeError(f"All Overpass API endpoints failed or timed out for {city_name}.")
        
    elements = data.get("elements", [])
    
    # Handle mandatory POIs using targeted fallback queries
    if mandatory_names:
        for m_name in mandatory_names:
            # Check if we already got it
            if any(m_name.lower() in str(el.get("tags", {}).get("name", "")).lower() for el in elements):
                continue
                
            logger.info(f"Mandatory POI '{m_name}' missing, fetching specifically...")
            # We use ~ to do a case-insensitive regex match (e.g. "name"~"(?i)sagrada familia")
            target_query = f"""
            [out:json][timeout:15];
            area["name"="{city_name}"]["admin_level"="8"]->.searchArea;
            nwr["name"~"(?i){m_name}"](area.searchArea);
            out center 1;
            """
            
            for endpoint in OVERPASS_ENDPOINTS:
                try:
                    async with httpx.AsyncClient(timeout=15.0) as client:
                        resp = await client.post(endpoint, data={"data": target_query}, headers=headers)
                        resp.raise_for_status()
                        t_data = resp.json()
                        t_elements = t_data.get("elements", [])
                        if t_elements:
                            elements.extend(t_elements)
                            logger.info(f"Successfully fetched mandatory POI: {m_name}")
                        break
                except Exception:
                    continue

    logger.info(f"Retrieved {len(elements)} raw elements from OSM.")
    return elements

def parse_osm_element_to_attraction(element: dict) -> Attraction | None:
    tags = element.get("tags", {})
    
    # Must have a name to be useful for itinerary
    name = tags.get("name") or tags.get("name:en")
    if not name:
        return None
        
    osm_id = str(element.get("id", ""))
    el_type = element.get("type", "node")
    
    # Coordinates (using center for ways/relations)
    lat = element.get("lat") or (element.get("center", {}).get("lat"))
    lon = element.get("lon") or (element.get("center", {}).get("lon"))
    
    if not lat or not lon:
        return None
        
    # Determine precise category
    category = "attraction"
    if tags.get("tourism") == "museum":
        category = "museum"
    elif tags.get("historic") in ["monument", "ruins", "castle"]:
        category = "monument"
        
    # Schedule
    opening_hours = tags.get("opening_hours")
    duration = 120 if category == "museum" else 45
    
    # Financials (fee parsing)
    fee_tag = tags.get("fee", "").lower()
    is_free = False
    estimated_cost = None
    
    if fee_tag in ["no", "false", "0"]:
        is_free = True
        estimated_cost = 0.0
    elif fee_tag in ["yes", "true"]:
        is_free = False
        
    charge_tag = tags.get("charge")
    if charge_tag:
        try:
            # Very basic extraction of first number as float (e.g. "15 EUR" -> 15.0)
            parts = charge_tag.split()
            nums = [float(p) for p in parts if p.replace('.','',1).isdigit()]
            if nums:
                estimated_cost = nums[0]
                is_free = (estimated_cost == 0)
        except Exception:
            pass

    return Attraction(
        id=f"OSM-{el_type}-{osm_id}",
        category=category,
        name=name,
        location=Location(latitude=lat, longitude=lon),
        schedule=AttractionSchedule(
            osm_opening_hours=opening_hours,
            recommended_duration_minutes=duration
        ),
        financials=AttractionFinancials(
            is_free=is_free,
            estimated_cost=estimated_cost,
            currency="EUR" # Defaulting for EU cities, could be inferred geographically
        ),
        scoring=Scoring(rating=0.0, reviews=0), # OSM doesn't have ratings natively
        metadata=Metadata(
            scraped_at=datetime.utcnow(),
            source="openstreetmap"
        )
    )

async def seed_city(city_name: str):
    elements = await fetch_pois_for_city(city_name, limit=20)
    
    attractions = []
    for el in elements:
        parsed = parse_osm_element_to_attraction(el)
        if parsed:
            attractions.append(parsed)
            
    logger.info(f"Successfully parsed {len(attractions)} attractions for {city_name}.")
    
    # For now, just dump to JSON to verify parsing. 
    # Next step: Database ingestion!
    output_file = f"tests/output/pois_{city_name.lower().replace(' ', '_')}.json"
    
    with open(output_file, "w", encoding="utf-8") as f:
        json.dump([a.model_dump(mode='json') for a in attractions], f, indent=4, ensure_ascii=False)
        
    logger.info(f"Saved to {output_file}")

if __name__ == "__main__":
    asyncio.run(seed_city("Madrid"))
