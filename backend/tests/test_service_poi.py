import pytest
from app.services.poi_service import is_poi_match


def test_is_poi_match_short_words():
    """
    Test that a 3-letter significant word (like 'Art') is enough to match
    when words are out of order, e.g. 'Art Museum' vs 'Museum of Art'.
    """
    assert is_poi_match("Art Museum", "Museum of Art") is True
    assert is_poi_match("The Art Museum", "Museum of Modern Art") is True


def test_is_poi_match_substring():
    assert is_poi_match("Prado", "Museo del Prado") is True


def test_is_poi_match_different():
    assert is_poi_match("Eiffel Tower", "Louvre Museum") is False


from datetime import datetime, timedelta, timezone
from unittest.mock import AsyncMock, patch

from app.schemas.scraper import (
    Attraction,
    AttractionFinancials,
    AttractionSchedule,
    Location,
    Metadata,
    Scoring,
)
from app.services.poi_service import STALE_TTL_DAYS, get_attractions_for_city


@pytest.fixture
def mock_repo():
    return AsyncMock()


@pytest.fixture
def mock_provider():
    return AsyncMock()


@pytest.mark.asyncio
async def test_get_attractions_cache_miss(mock_repo, mock_provider):
    mock_repo.find_by_city.return_value = []

    dummy_attraction = Attraction(
        id="OSM-node-1",
        category="attraction",
        name="Test",
        location=Location(latitude=0.0, longitude=0.0),
        schedule=AttractionSchedule(
            osm_opening_hours=None, recommended_duration_minutes=60
        ),
        financials=AttractionFinancials(
            is_free=True, estimated_cost=0.0, currency="EUR"
        ),
        scoring=Scoring(rating=0.0, reviews=0),
        metadata=Metadata(scraped_at=datetime.now(timezone.utc), source="test"),
    )
    mock_provider.fetch_attractions.return_value = [dummy_attraction]

    result = await get_attractions_for_city(
        "Madrid", poi_repo=mock_repo, poi_provider=mock_provider
    )

    mock_provider.fetch_attractions.assert_called_with(
        "Madrid", limit=150, mandatory_names=None
    )
    mock_repo.save_all_for_city.assert_called_with("Madrid", [dummy_attraction])

    assert len(result) == 1
    assert result[0]["name"] == "Test"


@pytest.mark.asyncio
@patch("app.services.poi_service.refresh_city_pois_task")
async def test_get_attractions_stale_cache(mock_task, mock_repo, mock_provider):
    old_date = datetime.now(timezone.utc) - timedelta(days=STALE_TTL_DAYS + 10)
    stale_attraction = Attraction(
        id="OSM-node-2",
        category="museum",
        name="Old Museum",
        location=Location(latitude=0.0, longitude=0.0),
        schedule=AttractionSchedule(
            osm_opening_hours=None, recommended_duration_minutes=60
        ),
        financials=AttractionFinancials(
            is_free=True, estimated_cost=0.0, currency="EUR"
        ),
        scoring=Scoring(rating=0.0, reviews=0),
        metadata=Metadata(scraped_at=old_date, source="test"),
    )
    mock_repo.find_by_city.return_value = [stale_attraction]

    result = await get_attractions_for_city(
        "Madrid", poi_repo=mock_repo, poi_provider=mock_provider
    )

    mock_provider.fetch_attractions.assert_not_called()
    mock_task.delay.assert_called_once_with("Madrid")

    assert len(result) == 1
    assert result[0]["name"] == "Old Museum"
