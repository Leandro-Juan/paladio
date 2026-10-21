"""
Unit tests verifying centralized IATA-to-city resolution across
Market API, lodging providers, universe manager, and swarm nodes.
"""

from unittest.mock import AsyncMock, MagicMock

import pytest
from app.api.market import _resolve_city_name as market_resolve_city
from app.engine.market.lodging.universe import PropertyUniverseManager
from app.engine.market.providers.agoda import AgodaProvider
from app.engine.market.providers.booking_scraper import BookingScraperProvider
from app.engine.market.providers.google_travel import GoogleTravelHotelsProvider
from app.engine.market.providers.trip_com import TripComProvider


@pytest.mark.asyncio
async def test_market_resolve_city_name_fallback_to_airport_service():
    """Verifies that market._resolve_city_name uses get_city_from_iata when DB misses."""
    mock_session = AsyncMock()
    mock_result = MagicMock()
    mock_result.scalar_one_or_none.return_value = None
    mock_session.execute.return_value = mock_result

    # FCO should resolve to Rome via AirportService
    name = await market_resolve_city(mock_session, "FCO")
    assert name == "Rome"

    # BER should resolve to Berlin
    name = await market_resolve_city(mock_session, "BER")
    assert name == "Berlin"

    # Unmapped code should return itself
    name = await market_resolve_city(mock_session, "ZZZ")
    assert name == "ZZZ"


@pytest.mark.asyncio
async def test_lodging_providers_resolve_city_name():
    """Verifies all four lodging providers resolve IATA codes via get_city_from_iata."""
    mock_session = AsyncMock()
    mock_result = MagicMock()
    mock_result.scalar_one_or_none.return_value = None
    mock_session.execute.return_value = mock_result

    providers = [
        GoogleTravelHotelsProvider(),
        BookingScraperProvider(),
        AgodaProvider(),
        TripComProvider(),
    ]

    for p in providers:
        # FCO -> Rome
        city_rome = await p._resolve_city_name(mock_session, "FCO")
        assert city_rome == "Rome", f"Failed for {p.name}"

        # MAD -> Madrid
        city_mad = await p._resolve_city_name(mock_session, "MAD")
        assert city_mad == "Madrid", f"Failed for {p.name}"

        # JFK -> New York
        city_jfk = await p._resolve_city_name(mock_session, "JFK")
        assert city_jfk == "New York", f"Failed for {p.name}"


@pytest.mark.asyncio
async def test_property_universe_manager_city_resolution():
    """Verifies PropertyUniverseManager uses get_city_from_iata when IATA is not mapped in DB."""
    mock_session = AsyncMock()
    mock_result = MagicMock()
    mock_result.first.return_value = None
    mock_session.execute.return_value = mock_result

    _city_id, _bbox, city_name = await PropertyUniverseManager.get_city_id_and_bbox(
        mock_session, "OPO"
    )
    assert city_name == "Porto"


@pytest.mark.asyncio
async def test_constraint_builder_destination_city_from_iata():
    """Verifies that assemble_constraints_node resolves destination city from flight destination IATA."""
    from app.schemas.itinerary import BookingAnchors, FlightSegment
    from app.swarm.nodes.constraint_builder import assemble_constraints_node

    state = {
        "booking_anchors": BookingAnchors(
            outbound_flight=FlightSegment(
                origin_iata="MAD",
                destination_iata="FCO",
                departure_time="2026-06-01T10:00:00",
            ),
            hotel=None,
        ),
        "manual_constraints": {"budget_usd": 1500.0},
    }

    res = await assemble_constraints_node(state)
    validated = res["validated_itinerary"]
    assert validated["origin_city"] == "Madrid"
    assert validated["destination_city"] == "Rome"
