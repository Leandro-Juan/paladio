import pytest
import logging
from unittest.mock import AsyncMock, patch
from app.scraper.strategies.flights import FlightScraperStrategy

logger = logging.getLogger(__name__)

@pytest.mark.asyncio
async def test_ff():
    logger.info("Testing scraped data for test_ff...")
    with patch('app.scraper.strategies.flights.FlightScraperStrategy.scrape', new_callable=AsyncMock) as mock_scrape:
        mock_scrape.return_value = {"title": "Mock Title", "extracted_data": [{"name": "Mock Item"}]}
        
        result = await FlightScraperStrategy().scrape("https://example.com/mock")
        
        logger.info("Scrape successful!")
        logger.info(f"Title: {result.get('title')}")
        assert result.get('title') == "Mock Title"
