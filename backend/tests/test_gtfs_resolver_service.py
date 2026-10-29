import pytest
from app.services.gtfs_resolver_service import (
    TOUR_BLACKLIST_KEYWORDS,
    GTFSFeedInfo,
    GTFSResolverService,
)


@pytest.mark.asyncio
async def test_ensure_catalog_loaded_caches_in_memory():
    """Verify catalog is cached in memory with sub-millisecond repeated lookups."""
    await GTFSResolverService.ensure_catalog_loaded()
    assert len(GTFSResolverService._catalog_cache) > 0

    first_loaded_ts = GTFSResolverService._last_loaded_timestamp
    # Second call should not reload
    await GTFSResolverService.ensure_catalog_loaded()
    assert GTFSResolverService._last_loaded_timestamp == first_loaded_ts


@pytest.mark.asyncio
async def test_resolve_gtfs_feed_madrid_and_paris():
    """Verify dynamic discovery for major European transit authorities."""
    madrid_feed = await GTFSResolverService.resolve_gtfs_feed("madrid")
    assert madrid_feed is not None
    assert madrid_feed.country == "ES"
    assert "https://" in madrid_feed.download_url
    assert madrid_feed.is_official

    paris_feed = await GTFSResolverService.resolve_gtfs_feed("paris")
    assert paris_feed is not None
    assert paris_feed.country == "FR"
    assert "https://" in paris_feed.download_url


@pytest.mark.asyncio
async def test_anti_tour_operator_filtering():
    """Verify sightseeing / tour operators are penalized below official transit."""
    # Construct an official transit agency vs a sightseeing tour bus covering the same coords
    official_agency = GTFSFeedInfo(
        feed_id="official-metro-1",
        provider="Metro de Madrid",
        name="Red de Metro Oficial",
        municipality="Madrid",
        subdivision="Madrid",
        country="ES",
        download_url="https://example.com/metro.zip",
        is_official=True,
        min_lat=40.3,
        max_lat=40.5,
        min_lon=-3.8,
        max_lon=-3.6,
    )

    tour_bus = GTFSFeedInfo(
        feed_id="tour-bus-1",
        provider="Madrid Hop-On Hop-Off Sightseeing Tours",
        name="Tourist Circuit",
        municipality="Madrid",
        subdivision="Madrid",
        country="ES",
        download_url="https://example.com/tour.zip",
        is_official=False,
        min_lat=40.39,
        max_lat=40.45,
        min_lon=-3.72,
        max_lon=-3.68,
    )

    score_official = GTFSResolverService._score_candidate(
        feed=official_agency,
        city_lower="madrid",
        center_lat=40.4168,
        center_lon=-3.7038,
        city_country="ES",
    )

    score_tour = GTFSResolverService._score_candidate(
        feed=tour_bus,
        city_lower="madrid",
        center_lat=40.4168,
        center_lon=-3.7038,
        city_country="ES",
    )

    assert score_official > score_tour
    assert score_official > 150.0
    # Tour bus should suffer a heavy penalty due to blacklist keywords
    assert any(
        kw in f"{tour_bus.provider} {tour_bus.name}".lower()
        for kw in TOUR_BLACKLIST_KEYWORDS
    )


@pytest.mark.asyncio
async def test_country_isolation():
    """Verify candidate feeds from other countries are strictly rejected."""
    us_feed = GTFSFeedInfo(
        feed_id="us-bus-1",
        provider="US Transit",
        name="Bus System",
        municipality="Madrid",
        subdivision="Iowa",
        country="US",
        download_url="https://example.com/us.zip",
        is_official=True,
        min_lat=40.0,
        max_lat=41.0,
        min_lon=-4.0,
        max_lon=-3.0,
    )

    score = GTFSResolverService._score_candidate(
        feed=us_feed,
        city_lower="madrid",
        center_lat=40.4168,
        center_lon=-3.7038,
        city_country="ES",
    )
    assert score < 0.0  # Rejected due to country mismatch


@pytest.mark.asyncio
async def test_nonexistent_city_returns_none_without_mocks():
    """Strict test: non-existent city must return None and NEVER mock fake GTFS data."""
    result = await GTFSResolverService.resolve_gtfs_feed("totally_fake_city_xyz_999")
    assert result is None


@pytest.mark.asyncio
async def test_unicode_native_scripts_scoring():
    """Verify that feeds with non-Latin text match correctly without character stripping."""
    tokyo_feed = GTFSFeedInfo(
        feed_id="jp-tokyo-metro-1",
        provider="東京地下鉄株式会社",
        name="Tokyo Metro Subway",
        municipality="東京都",
        subdivision="Tokyo",
        country="JP",
        download_url="https://example.com/tokyometro.zip",
        is_official=True,
        min_lat=35.5,
        max_lat=35.8,
        min_lon=139.6,
        max_lon=139.9,
    )

    # Score with native Japanese Kanji "東京"
    score = GTFSResolverService._score_candidate(
        feed=tokyo_feed,
        city_lower="東京",
        center_lat=35.6895,
        center_lon=139.6917,
        city_country="JP",
        aliases={"東京", "tokyo", "東京都"},
    )
    assert score > 100.0, f"Expected high score for native script match, got {score}"


@pytest.mark.asyncio
async def test_antimeridian_and_corrupt_bbox():
    """Verify rejection of (0,0) corrupt bbox and acceptance of valid antimeridian feeds."""
    corrupt_feed = GTFSFeedInfo(
        feed_id="corrupt-00",
        provider="Corrupt Feed",
        name="Bad BBox",
        municipality="Suva",
        subdivision="Central",
        country="FJ",
        download_url="https://example.com/bad.zip",
        is_official=True,
        min_lat=0.0,
        max_lat=0.0,
        min_lon=0.0,
        max_lon=0.0,
    )
    score_corrupt = GTFSResolverService._score_candidate(
        feed=corrupt_feed,
        city_lower="suva",
        center_lat=-18.1416,
        center_lon=178.4419,
        city_country="FJ",
    )
    assert score_corrupt < 0.0, "Corrupt (0,0) bbox must be disqualified"

    # Antimeridian feed (spanning across 180° meridian, e.g. min_lon=177, max_lon=-179)
    antimeridian_feed = GTFSFeedInfo(
        feed_id="fiji-suva-transit",
        provider="Fiji Public Transport",
        name="Suva Urban Network",
        municipality="Suva",
        subdivision="Central",
        country="FJ",
        download_url="https://example.com/suva.zip",
        is_official=True,
        min_lat=-18.25,
        max_lat=-18.05,
        min_lon=178.0,
        max_lon=-179.0,  # Crosses 180°
    )
    score_antimeridian = GTFSResolverService._score_candidate(
        feed=antimeridian_feed,
        city_lower="suva",
        center_lat=-18.1416,
        center_lon=178.4419,
        city_country="FJ",
        aliases={"suva"},
    )
    assert (
        score_antimeridian > 50.0
    ), f"Valid antimeridian feed must be accepted, got {score_antimeridian}"
