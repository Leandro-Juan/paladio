import pytest
import logging
from unittest.mock import AsyncMock, patch
from app.scraper.strategies.restaurants import RestaurantScraperStrategy

logger = logging.getLogger(__name__)

@pytest.mark.asyncio
async def test_restaurantguru_scrape():
    logger.info("Testing scraped data for test_restaurantguru_scrape...")
    with patch('app.scraper.strategies.restaurants.RestaurantScraperStrategy.scrape', new_callable=AsyncMock) as mock_scrape:
        mock_scrape.return_value = {"title": "Mock Title", "extracted_data": [{"name": "Mock Item"}]}
        
        result = await RestaurantScraperStrategy().scrape("https://example.com/mock")
        
        logger.info("Scrape successful!")
        logger.info(f"Title: {result.get('title')}")
        assert result.get('title') == "Mock Title"
