"""Unit tests for GoogleMapsRatingResolver without external network calls."""

from unittest.mock import AsyncMock, patch
import pytest

from app.services.google_maps_rating_resolver import GoogleMapsRatingResolver


@pytest.mark.asyncio
async def test_resolve_rating_from_redis_cache():
    """Test that cached rating is immediately returned from Redis."""
    cached_payload = {
        "rating": 4.6,
        "reviews": 42000,
        "source": "google_maps",
        "fetched_at": "2026-10-25T14:00:00Z",
    }
    with patch.object(
        GoogleMapsRatingResolver,
        "get_cached_rating",
        new=AsyncMock(return_value=cached_payload),
    ):
        result = await GoogleMapsRatingResolver.resolve_rating(
            poi_id="test-poi-123",
            name="Tokyo Tower",
            city="Tokyo",
        )
        assert result is not None
        assert result["rating"] == 4.6
        assert result["reviews"] == 42000
        assert result["source"] == "google_maps"


@pytest.mark.asyncio
async def test_resolve_rating_live_scrape():
    """Test live scraping path when cache is empty."""
    scraped_payload = {
        "rating": 4.5,
        "reviews": 18200,
        "source": "google_maps",
        "fetched_at": "2026-10-25T14:00:00Z",
    }
    with patch.object(
        GoogleMapsRatingResolver, "get_cached_rating", new=AsyncMock(return_value=None)
    ), patch.object(
        GoogleMapsRatingResolver,
        "scrape_rating",
        new=AsyncMock(return_value=scraped_payload),
    ), patch.object(
        GoogleMapsRatingResolver, "set_cached_rating", new=AsyncMock()
    ) as mock_set_cache:
        result = await GoogleMapsRatingResolver.resolve_rating(
            poi_id="test-poi-456",
            name="Sensō-ji",
            city="Tokyo",
        )
        assert result is not None
        assert result["rating"] == 4.5
        assert result["reviews"] == 18200
        mock_set_cache.assert_called_once_with("test-poi-456", scraped_payload)
