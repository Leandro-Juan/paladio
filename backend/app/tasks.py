import logging
import asyncio
from typing import List, Dict, Any
from app.celery_app import app

# Import scrapers
from app.scraper.static_scraper import scrape_static
from app.scraper.dynamic_scraper import scrape_dynamic
from app.scraper.exceptions import BotDetectionError, RateLimitError
import httpx

logger = logging.getLogger(__name__)

@app.task(
    bind=True, 
    name="app.tasks.scrape_static_task",
    autoretry_for=(Exception, BotDetectionError, RateLimitError, httpx.HTTPStatusError), 
    retry_backoff=True, 
    retry_jitter=True,
    retry_backoff_max=600,
    max_retries=5
)
def scrape_static_task(self, url: str) -> Dict[str, Any]:
    """
    Celery task wrapper for static scraping.
    """
    logger.info(f"Task {self.request.id}: Starting static scrape for {url}")
    try:
        # Since Celery workers run synchronously by default, we use asyncio.run
        result = asyncio.run(scrape_static(url))
        return result
    except Exception as exc:
        logger.error(f"Task {self.request.id}: Failed static scrape for {url}: {exc}")
        # Reraise to trigger autoretry
        raise

@app.task(
    bind=True, 
    name="app.tasks.scrape_dynamic_task",
    autoretry_for=(Exception, BotDetectionError, RateLimitError, httpx.HTTPStatusError), 
    retry_backoff=True, 
    retry_jitter=True,
    retry_backoff_max=1200, # Longer backoff for dynamic scraping
    max_retries=5
)
def scrape_dynamic_task(self, url: str) -> Dict[str, Any]:
    """
    Celery task wrapper for dynamic Playwright scraping.
    """
    logger.info(f"Task {self.request.id}: Starting dynamic scrape for {url}")
    try:
        # Run the async Playwright code synchronously
        result = asyncio.run(scrape_dynamic(url))
        return result
    except Exception as exc:
        logger.error(f"Task {self.request.id}: Failed dynamic scrape for {url}: {exc}")
        raise

@app.task(bind=True, name="app.tasks.scrape_flight_prices_task")
def scrape_flight_prices_task(self):
    """
    Orchestrator task that triggers the individual scraping tasks.
    This replaces the previous dummy task.
    """
    logger.info("Orchestrator started: dispatching scraping jobs...")
    
    # List of target websites to scrape (e.g. Skyscanner, Ryanair, Booking, eDreams)
    # Using specific landing pages for testing.
    static_targets = [
        "https://jsonplaceholder.typicode.com/posts/1", # Mock static endpoint for testing
    ]
    
    dynamic_targets = [
        "https://example.com", # Simple dynamic fallback
        # In a real environment, you'd target:
        # "https://www.skyscanner.net/",
        # "https://www.ryanair.com/",
        # "https://www.booking.com/",
    ]
    
    # Dispatch static tasks
    for url in static_targets:
        scrape_static_task.delay(url)
        
    # Dispatch dynamic tasks
    for url in dynamic_targets:
        scrape_dynamic_task.delay(url)
        
    logger.info("Orchestrator finished: jobs dispatched to queue.")
    
    return {"status": "success", "message": f"Dispatched {len(static_targets)} static and {len(dynamic_targets)} dynamic scraping tasks."}

@app.task(bind=True, name="app.tasks.refresh_city_pois_task")
def refresh_city_pois_task(self, city_name: str):
    """
    Background SWR task: Fetches updated POIs for a city and saves them to the DB.
    """
    logger.info(f"Task {self.request.id}: Background SWR refresh started for {city_name}")
    
    # Import inside the task to prevent circular imports
    from app.services.poi_service import _fetch_and_store_pois
    
    try:
        # Run the async ingestion script synchronously in the Celery worker
        asyncio.run(_fetch_and_store_pois(city_name))
        logger.info(f"Task {self.request.id}: Successfully refreshed POIs for {city_name}")
        return {"status": "success", "city": city_name}
    except Exception as exc:
        logger.error(f"Task {self.request.id}: Failed to refresh POIs for {city_name}: {exc}")
        raise

@app.task(bind=True, name="app.tasks.build_city_map_task")
def build_city_map_task(self, city_name: str):
    """
    Downloads OSM map data for the requested city and triggers a Valhalla tile rebuild.
    """
    import os
    import urllib.request
    try:
        import docker
    except ImportError:
        logger.error("docker library not installed in worker. Please install docker-py.")
        raise
        
    logger.info(f"Task {self.request.id}: Starting Valhalla map build for {city_name}")
    
    # Map cities to their Geofabrik paths (simplified for MVP)
    geofabrik_map = {
        "oporto": "europe/portugal-latest.osm.pbf",
        "porto": "europe/portugal-latest.osm.pbf",
        "madrid": "europe/spain/madrid-latest.osm.pbf",
        "paris": "europe/france/ile-de-france-latest.osm.pbf"
    }
    
    city_lower = city_name.lower()
    path = geofabrik_map.get(city_lower)
    
    if not path:
        logger.error(f"No Geofabrik mapping found for {city_name}.")
        return {"status": "error", "message": "Unknown city mapping"}
        
    url = f"http://download.geofabrik.de/{path}"
    file_name = path.split('/')[-1]
    
    # We mounted 'valhalladata' to '/custom_files' in the worker
    dest_path = f"/custom_files/{file_name}"
    
    try:
        logger.info(f"Downloading {url} to {dest_path}...")
        # Since this is a Celery worker, blocking urllib is fine
        urllib.request.urlretrieve(url, dest_path)
        logger.info(f"Successfully downloaded {file_name}.")
        
        # Connect to Docker socket to restart the Valhalla container
        logger.info("Connecting to Docker socket to restart Valhalla container...")
        client = docker.DockerClient(base_url='unix://var/run/docker.sock')
        
        # Find the valhalla container
        valhalla_containers = client.containers.list(filters={"name": "valhalla"})
        if not valhalla_containers:
            logger.error("Valhalla container not found! Cannot restart.")
            return {"status": "error", "message": "Valhalla container not found"}
            
        target_container = valhalla_containers[0]
        logger.info(f"Restarting container: {target_container.name}")
        target_container.restart()
        logger.info(f"Container {target_container.name} restarted successfully. Valhalla will compile {file_name} on boot.")
        
        return {"status": "success", "city": city_name, "file": file_name}
        
    except Exception as exc:
        logger.error(f"Failed to build map for {city_name}: {exc}")
        raise


