import httpx
import logging
import os
from app.scraper.exceptions import BotDetectionError, RateLimitError

logger = logging.getLogger(__name__)

async def scrape_static(url: str, params: dict = None) -> dict:
    """
    Scrapes a lightweight, static API endpoint using HTTPX asynchronously.
    """
    logger.info(f"Starting static scrape for URL: {url}")
    
    # Configure timeout to avoid hanging indefinitely
    timeout = httpx.Timeout(10.0, connect=5.0)
    
    # Use headers that mimic a standard browser to avoid basic blocks
    headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept": "application/json, text/plain, */*",
        "Accept-Language": "en-US,en;q=0.9",
    }
    
    proxy_url = os.environ.get("WEBSHARE_PROXY_URL")
    
    # Configure the client, injecting proxy if available
    client_kwargs = {"timeout": timeout, "headers": headers}
    if proxy_url:
        client_kwargs["proxy"] = proxy_url
        logger.info("Using Webshare proxy for static request.")
        
    async with httpx.AsyncClient(**client_kwargs) as client:
        try:
            response = await client.get(url, params=params)
            
            if response.status_code == 429:
                raise RateLimitError(f"HTTP 429 Too Many Requests received for {url}")
                
            response.raise_for_status()
            
            # Assuming the endpoint returns JSON
            try:
                data = response.json()
                text_content = str(data)
            except ValueError:
                data = {"raw_text": response.text[:1000]} # fallback if not json
                text_content = response.text
                
            # Basic CAPTCHA detection logic
            captcha_keywords = ["Are you a person or a robot?", "Access Denied", "captcha", "Incapsula", "Cloudflare"]
            for keyword in captcha_keywords:
                if keyword.lower() in text_content.lower():
                    raise BotDetectionError(f"Bot detection triggered (found '{keyword}') for URL: {url}")
                
            logger.info(f"Successfully scraped static URL: {url}")
            return {
                "url": url,
                "status_code": response.status_code,
                "data": data
            }
            
        except httpx.HTTPStatusError as exc:
            logger.error(f"HTTP error {exc.response.status_code} while requesting {url}")
            raise
        except httpx.RequestError as exc:
            logger.error(f"Request error while requesting {url}: {exc}")
            raise
        except Exception as exc:
            logger.error(f"Unexpected error while scraping {url}: {exc}")
            raise
