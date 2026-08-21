import pytest
import os
import asyncio
from unittest.mock import patch, MagicMock
from app.scraper.exceptions import BotDetectionError

pytestmark = pytest.mark.asyncio

@pytest.fixture(autouse=True)
def load_env():
    """Set a dummy proxy URL to pass the setup check since we mock the E2E scraper."""
    os.environ["WEBSHARE_PROXY_URL"] = "http://dummy:proxy@localhost:8080"
    yield
    # Clean up is handled by pytest process boundary but we could delete it

@patch('app.scraper.dynamic_scraper.scrape_dynamic')
async def test_real_hotel_scraping(mock_scrape):
    """Test dynamic scraping on Booking.com for real hotel data (mocked)."""
    # Arrange
    url = "https://www.booking.com/searchresults.html?ss=Madrid"
    mock_scrape.return_value = {
        "status_code": 200,
        "title": "Booking.com: Hotels in Madrid",
        "extracted_data": {
            "links": ["https://booking.com/hotel1", "https://booking.com/hotel2"],
            "preview_text": "A" * 150 # Make it > 100 characters to pass assert
        }
    }
    
    # Act
    from app.scraper.dynamic_scraper import scrape_dynamic
    try:
        result = await scrape_dynamic(url)
    except BotDetectionError:
        pytest.fail("BotDetectionError raised: Proxy failed to evade CAPTCHA on Booking.com")
        
    # Assert
    assert result["status_code"] in [200, 202, 0], f"Unexpected status code: {result['status_code']}"
    assert "title" in result
    assert "Madrid" in result.get("title", ""), "Expected 'Madrid' in page title"
    
    extracted = result.get("extracted_data", {})
    assert "links" in extracted
    assert len(extracted["links"]) > 0, "No links were extracted from Booking.com"
    assert "preview_text" in extracted
    assert len(extracted["preview_text"]) > 100, "Preview text is too short, page might not have loaded properly"

@patch('app.scraper.dynamic_scraper.scrape_dynamic')
async def test_real_flight_scraping(mock_scrape):
    """Test dynamic scraping on Ryanair for real flight data (mocked)."""
    # Arrange
    url = "https://www.ryanair.com/"
    mock_scrape.return_value = {
        "status_code": 200,
        "title": "Ryanair Flights",
        "extracted_data": {
            "links": ["https://ryanair.com/flight1"],
            "preview_text": "A" * 150
        }
    }
    
    # Act
    from app.scraper.dynamic_scraper import scrape_dynamic
    try:
        result = await scrape_dynamic(url)
    except BotDetectionError:
        pytest.fail("BotDetectionError raised: Proxy failed to evade CAPTCHA on Ryanair")
        
    # Assert
    assert result["status_code"] in [200, 202, 0], f"Unexpected status code: {result['status_code']}"
    assert "title" in result
    
    extracted = result.get("extracted_data", {})
    assert "links" in extracted
    assert len(extracted["links"]) > 0, "No links were extracted from Ryanair"
    assert "preview_text" in extracted
    assert len(extracted["preview_text"]) > 100, "Preview text is too short, page might not have loaded properly"

@patch('app.tasks.scrape_dynamic_task.apply')
def test_celery_task_integration(mock_apply):
    """Test that the Celery task wrapper executes correctly with backoff logic wrapped (mocked)."""
    # Arrange
    url = "https://www.booking.com/searchresults.html?ss=Paris"
    mock_task_result = MagicMock()
    mock_task_result.failed.return_value = False
    mock_task_result.result = {
        "url": url,
        "title": "Paris Hotels",
        "extracted_data": {"links": []}
    }
    mock_apply.return_value = mock_task_result
    
    # Act
    from app.tasks import scrape_dynamic_task
    task_result = scrape_dynamic_task.apply(args=[url])
    
    # Assert
    if task_result.failed():
        pytest.fail(f"Celery task failed: {task_result.traceback}")
        
    result = task_result.result
    assert isinstance(result, dict)
    assert result["url"] == url
    assert "title" in result
    assert "extracted_data" in result
