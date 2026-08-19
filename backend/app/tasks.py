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
