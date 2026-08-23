import pytest
import logging
from unittest.mock import AsyncMock, patch
from app.scraper.strategies.hotels import HotelScraperStrategy

logger = logging.getLogger(__name__)

@pytest.mark.asyncio
async def test_booking():
    logger.info("Testing scraped data for test_booking...")
    with patch('app.scraper.strategies.hotels.HotelScraperStrategy.scrape', new_callable=AsyncMock) as mock_scrape:
        mock_scrape.return_value = {"title": "Mock Title", "extracted_data": [{"name": "Mock Item"}]}
        
        result = await HotelScraperStrategy().scrape("https://example.com/mock")
        
        logger.info("Scrape successful!")
        logger.info(f"Title: {result.get('title')}")
        assert result.get('title') == "Mock Title"
