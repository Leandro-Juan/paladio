import asyncio
import logging
from typing import Any

import httpx

from app.celery_app import app
from app.scraper.exceptions import BotDetectionError, RateLimitError

# Import scrapers
from app.scraper.static_scraper import scrape_static

logger = logging.getLogger(__name__)


@app.task(
    bind=True,
    name="app.tasks.scrape_static_task",
    autoretry_for=(Exception, BotDetectionError, RateLimitError, httpx.HTTPStatusError),
    retry_backoff=True,
    retry_jitter=True,
    retry_backoff_max=600,
    max_retries=5,
)
def scrape_static_task(self, url: str) -> dict[str, Any]:
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
        "https://jsonplaceholder.typicode.com/posts/1",  # Mock static endpoint for testing
    ]

    # Dispatch static tasks
    for url in static_targets:
        scrape_static_task.delay(url)

    logger.info("Orchestrator finished: jobs dispatched to queue.")

    return {
        "status": "success",
        "message": f"Dispatched {len(static_targets)} static scraping tasks.",
    }


@app.task(bind=True, name="app.tasks.refresh_city_pois_task")
def refresh_city_pois_task(self, city_name: str):
    """
    Background SWR task: Fetches updated POIs for a city and saves them to the DB.
    """
    logger.info(
        f"Task {self.request.id}: Background SWR refresh started for {city_name}"
    )

    # Import inside the task to prevent circular imports
    from app.adapters.repositories.sql_poi_repository import SqlPoiRepository
    from app.infrastructure.providers.overpass_provider import OverpassProviderAdapter
    from app.services.poi_service import _fetch_and_store_pois

    try:
        # Run the async ingestion script synchronously in the Celery worker
        repo = SqlPoiRepository()
        provider = OverpassProviderAdapter()
        asyncio.run(_fetch_and_store_pois(city_name, repo, provider))
        logger.info(
            f"Task {self.request.id}: Successfully refreshed POIs for {city_name}"
        )
        return {"status": "success", "city": city_name}
    except Exception as exc:
        logger.error(
            f"Task {self.request.id}: Failed to refresh POIs for {city_name}: {exc}"
        )
        raise


@app.task(
    bind=True,
    name="app.tasks.build_city_map_task",
    autoretry_for=(Exception, httpx.HTTPStatusError, httpx.RequestError),
    retry_backoff=True,
    max_retries=3,
)
def build_city_map_task(self, city_name: str):
    """
    Downloads OSM map data for the requested city and triggers a Valhalla tile rebuild.
    """
    import os
    import urllib.request

    logger.info(f"Task {self.request.id}: Starting Valhalla map build for {city_name}")

    # Map cities to their Geofabrik paths (simplified for MVP)
    geofabrik_map = {
        "oporto": "europe/portugal-latest.osm.pbf",
        "porto": "europe/portugal-latest.osm.pbf",
        "madrid": "europe/spain/madrid-latest.osm.pbf",
        "paris": "europe/france/ile-de-france-latest.osm.pbf",
    }

    city_lower = city_name.lower()
    path = geofabrik_map.get(city_lower)

    if not path:
        logger.error(f"No Geofabrik mapping found for {city_name}.")
        return {"status": "error", "message": "Unknown city mapping"}

    url = f"http://download.geofabrik.de/{path}"
    file_name = path.split("/")[-1]

    # We mounted 'valhalladata' to '/custom_files' in the worker
    dest_path = f"/custom_files/{file_name}"

    try:
        logger.info(f"Downloading {url} to {dest_path}...")
        # Since this is a Celery worker, blocking urllib is fine
        urllib.request.urlretrieve(url, dest_path)
        logger.info(f"Successfully downloaded {file_name}.")

        # We no longer access the Docker socket from Celery for security reasons.
        # Instead, we trigger an internal webhook that the host system listens to,
        # or we just log it for an external cron job.
        logger.info("Triggering Valhalla map rebuild via internal webhook...")
        try:
            webhook_url = os.getenv(
                "VALHALLA_REBUILD_WEBHOOK", "http://host.docker.internal:8080/rebuild"
            )
            response = httpx.post(
                webhook_url, json={"file": file_name, "city": city_name}, timeout=10.0
            )
            response.raise_for_status()
            logger.info(
                "Webhook triggered successfully. Valhalla will compile the new map."
            )
        except httpx.RequestError as e:
            logger.error(f"Network error triggering Valhalla rebuild webhook: {e}")
            raise
        except httpx.HTTPStatusError as e:
            logger.error(
                f"Webhook returned error status {e.response.status_code}: {e.response.text}"
            )
            raise

        return {"status": "success", "city": city_name, "file": file_name}

    except Exception as exc:
        logger.error(f"Failed to build map for {city_name}: {exc}")
        raise
