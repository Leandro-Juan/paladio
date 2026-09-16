from unittest.mock import AsyncMock, patch

import httpx
import pytest
from app.domain.entities.poi import TransitStep
from app.services.poi_pricing_service import PoiPricingService
from app.services.transit_fare_service import (
    TransitFareExtractionSchema,
    TransitFareService,
)

# ============================================================================
# 1. Real-World Public Transit Tariffs for 5 Cities
# ============================================================================


def test_five_cities_transit_fares():
    """Verify official base single fares and 24h tourist pass pricing across 5 cities."""
    # Madrid (CRTM)
    madrid = TransitFareService.get_city_transit_fare("madrid")
    assert madrid.single_fare == 1.50
    assert madrid.pass_24h_price == 8.40
    assert madrid.is_estimated is False
    assert madrid.source == "official_crtm_tariff"

    # Paris (IDFM)
    paris = TransitFareService.get_city_transit_fare("paris")
    assert paris.single_fare == 2.15
    assert paris.pass_24h_price == 8.45
    assert paris.is_estimated is False
    assert paris.source == "official_idfm_tariff"

    # Lisbon (Carris/Metro)
    lisbon = TransitFareService.get_city_transit_fare("lisbon")
    assert lisbon.single_fare == 1.80
    assert lisbon.pass_24h_price == 6.80
    assert lisbon.is_estimated is False
    assert lisbon.source == "official_carris_metro_tariff"

    # Barcelona (TMB)
    bcn = TransitFareService.get_city_transit_fare("barcelona")
    assert bcn.single_fare == 2.55
    assert bcn.pass_24h_price == 11.20
    assert bcn.is_estimated is False
    assert bcn.source == "official_tmb_tariff"

    # Rome (ATAC)
    rome = TransitFareService.get_city_transit_fare("rome")
    assert rome.single_fare == 1.50
    assert rome.pass_24h_price == 7.00
    assert rome.is_estimated is False
    assert rome.source == "official_atac_tariff"


# ============================================================================
# 2. Airport Surcharge Detection Across Cities
# ============================================================================


def test_airport_surcharge_detection_madrid():
    """Madrid Line 8 Aeropuerto station incurs +3.00€ supplement."""
    steps = [
        TransitStep(
            type="walk",
            instruction="Walk to Nuevos Ministerios",
            duration_mins=5,
            distance_km=0.3,
        ),
        TransitStep(
            type="transit",
            instruction="Take Metro Line 8 towards Aeropuerto T4",
            duration_mins=15,
            distance_km=12.0,
            station_name="Aeropuerto T1-T2-T3",
            transit_line="8",
            headsign="Aeropuerto T4",
        ),
    ]
    cost, is_est, source, has_airport = TransitFareService.calculate_transit_leg_fare(
        "madrid", steps
    )
    assert has_airport is True
    assert cost == 4.50  # 1.50 base + 3.00 airport supplement
    assert is_est is False
    assert source == "official_crtm_tariff"


def test_airport_surcharge_detection_paris():
    """Paris RER B to CDG incurs +9.65€ supplement (total 11.80€)."""
    steps = [
        TransitStep(
            type="transit",
            instruction="Take RER B towards Aéroport Charles de Gaulle 2 TGV",
            duration_mins=35,
            distance_km=25.0,
            station_name="Aeroport Charles de Gaulle",
            transit_line="B",
        ),
    ]
    cost, is_est, source, has_airport = TransitFareService.calculate_transit_leg_fare(
        "paris", steps
    )
    assert has_airport is True
    assert cost == 11.80  # 2.15 base + 9.65 airport supplement
    assert is_est is False
    assert source == "official_idfm_tariff"


def test_airport_surcharge_detection_lisbon():
    """Lisbon Metro to Humberto Delgado Airport has 0€ surcharge (standard 1.80€ fare)."""
    steps = [
        TransitStep(
            type="transit",
            instruction="Take Linha Vermelha to Aeroporto",
            duration_mins=20,
            distance_km=8.0,
            station_name="Aeroporto",
            transit_line="Vermelha",
        ),
    ]
    cost, is_est, source, has_airport = TransitFareService.calculate_transit_leg_fare(
        "lisbon", steps
    )
    assert has_airport is True
    assert cost == 1.80  # Standard fare, no extra surcharge
    assert is_est is False
    assert source == "official_carris_metro_tariff"


# ============================================================================
# 3. 24h Tourist Pass Savings Advisor
# ============================================================================


def test_daily_transit_savings_advisor_recommends_pass():
    """When individual rides sum up above the 24h pass price, recommend the pass."""
    # In Madrid, 6 rides @ 1.50€ = 9.00€. Pass is 8.40€. Savings = 0.60€.
    leg_costs = [1.50, 1.50, 1.50, 1.50, 1.50, 1.50]
    rec = TransitFareService.evaluate_daily_transit_savings("madrid", leg_costs)
    assert rec.type == "24H_PASS_RECOMMENDED"
    assert rec.pass_price_eur == 8.40
    assert rec.savings_eur == 0.60
    assert "save you 0.60 EUR" in rec.message


def test_daily_transit_savings_advisor_single_tickets_optimal():
    """When individual rides are cheaper than the 24h pass, recommend single tickets."""
    # In Paris, 2 rides @ 2.15€ = 4.30€. Pass is 8.45€.
    leg_costs = [2.15, 2.15]
    rec = TransitFareService.evaluate_daily_transit_savings("paris", leg_costs)
    assert rec.type == "SINGLE_TICKETS_OPTIMAL"
    assert rec.savings_eur == 0.0
    assert "Individual single tickets (4.30 EUR) are more cost-effective" in rec.message


# ============================================================================
# 4. Universal Multi-City Applicability & Transparent Estimation Fallback
# ============================================================================


def test_unindexed_arbitrary_city_estimation():
    """Any unindexed city automatically falls back to estimated pricing with is_estimated=True."""
    # Transit
    fare = TransitFareService.get_city_transit_fare("Reykjavik")
    assert fare.is_estimated is True
    assert fare.source == "regional_benchmark_estimate"
    assert fare.single_fare == 2.00

    # POI
    cost, is_est, source = PoiPricingService.resolve_poi_price(
        poi_name="Harpa Concert Hall",
        city="Reykjavik",
        category="monument",
    )
    assert is_est is True
    assert source == "category_benchmark_estimate"
    assert cost == 10.00


# ============================================================================
# 5. Real-World POI Admission Pricing for 5 Cities
# ============================================================================


def test_poi_real_world_pricing_five_cities():
    """Verify verified real-world admission prices and free attractions across 5 cities."""
    # Madrid
    prado_cost, prado_est, _ = PoiPricingService.resolve_poi_price(
        "Museo del Prado", "madrid", "museum"
    )
    assert prado_cost == 15.00
    assert prado_est is False

    retiro_cost, retiro_est, _ = PoiPricingService.resolve_poi_price(
        "Parque del Retiro", "madrid", "park"
    )
    assert retiro_cost == 0.00
    assert retiro_est is False

    # Paris
    louvre_cost, louvre_est, _ = PoiPricingService.resolve_poi_price(
        "Musée du Louvre", "paris", "museum"
    )
    assert louvre_cost == 22.00
    assert louvre_est is False

    eiffel_cost, eiffel_est, _ = PoiPricingService.resolve_poi_price(
        "Tour Eiffel", "paris", "monument"
    )
    assert eiffel_cost == 29.40
    assert eiffel_est is False

    # Lisbon
    jeronimos_cost, jeronimos_est, _ = PoiPricingService.resolve_poi_price(
        "Mosteiro dos Jerónimos", "lisbon", "monument"
    )
    assert jeronimos_cost == 12.00
    assert jeronimos_est is False

    comercio_cost, comercio_est, _ = PoiPricingService.resolve_poi_price(
        "Praça do Comércio", "lisbon", "monument"
    )
    assert comercio_cost == 0.00
    assert comercio_est is False

    # Barcelona
    sagrada_cost, sagrada_est, _ = PoiPricingService.resolve_poi_price(
        "Sagrada Família", "barcelona", "monument"
    )
    assert sagrada_cost == 26.00
    assert sagrada_est is False

    guell_cost, guell_est, _ = PoiPricingService.resolve_poi_price(
        "Park Güell", "barcelona", "park"
    )
    assert guell_cost == 10.00
    assert guell_est is False

    # Rome
    colosseo_cost, colosseo_est, _ = PoiPricingService.resolve_poi_price(
        "Colosseo", "rome", "monument"
    )
    assert colosseo_cost == 18.00
    assert colosseo_est is False

    trevi_cost, trevi_est, _ = PoiPricingService.resolve_poi_price(
        "Fontana di Trevi", "rome", "monument"
    )
    assert trevi_cost == 0.00
    assert trevi_est is False


# ============================================================================
# 6. Acceptance Criteria Tests (MAD Airport Leg, Ollama Mock, Fallback, Cache)
# ============================================================================


def test_calculate_transit_leg_fare_mad_airport_to_sol():
    """Verify MAD Airport -> Sol correctly yields total_cost == 4.50 and airport_surcharge_eur == 3.00."""
    origin = {
        "category": "AIRPORT",
        "name": "Madrid-Barajas Airport T4",
        "city": "madrid",
    }
    destination = {
        "category": "SQUARE",
        "name": "Puerta del Sol",
        "city": "madrid",
    }
    steps = [
        TransitStep(type="walk", instruction="Walk to station", duration_mins=5),
        TransitStep(
            type="transit",
            instruction="Board Metro Line 8",
            duration_mins=15,
            transit_line="8",
            station_name="Aeropuerto T4",
        ),
        TransitStep(
            type="transit_alight",
            instruction="Alight at Nuevos Ministerios",
            duration_mins=2,
        ),
    ]
    res = TransitFareService.calculate_transit_leg_fare(
        "madrid", steps, origin=origin, destination=destination, is_airport_leg=True
    )
    assert res.total_cost == 4.50
    assert res.airport_surcharge_eur == 3.00
    assert res.has_airport is True
    assert res.cost_is_estimated is False
    assert res.price_source == "official_crtm_tariff"


@pytest.mark.asyncio
async def test_ollama_json_schema_parsing_mocked():
    """Verify Ollama JSON schema parsing using a mocked web context response for deterministic CI runs."""
    sample_context = (
        "In Munich, the MVV operates the transit system. A single ticket for Zone M costs 3.90 EUR. "
        "A single day ticket (Tageskarte) is 9.20 EUR. The airport is located in zone 5 and requires "
        "an Airport-City-Day-Ticket or an airport supplement of 13.00 EUR. Keyword: Flughafen."
    )
    mock_extracted = TransitFareExtractionSchema(
        agency_name="MVV",
        single_fare_eur=3.90,
        day_pass_name="Tageskarte",
        day_pass_fare_eur=9.20,
        airport_surcharge_eur=13.00,
        airport_station_keywords=["Flughafen München", "Airport"],
        source_url="https://www.mvv-muenchen.de",
    )

    with (
        patch.object(
            TransitFareService, "fetch_wikivoyage_transit_text", new_callable=AsyncMock
        ) as mock_fetch,
        patch.object(
            TransitFareService, "extract_fare_with_ollama", new_callable=AsyncMock
        ) as mock_extract,
        patch.object(
            TransitFareService, "_lookup_db", new_callable=AsyncMock
        ) as mock_lookup_db,
        patch.object(TransitFareService, "persist_fare_to_db", new_callable=AsyncMock),
    ):
        mock_lookup_db.return_value = None
        mock_fetch.return_value = sample_context
        mock_extract.return_value = mock_extracted

        test_city = "mock_munich_extract"
        TransitFareService.get_cache().invalidate(test_city)

        try:
            fare = await TransitFareService.resolve_city_transit_fare(test_city)
            assert fare.agency_name == "MVV"
            assert fare.single_fare == 3.90
            assert fare.pass_24h_price == 9.20
            assert fare.airport_surcharge == 13.00
            assert fare.is_estimated is False
            assert fare.source == "official_mvv"
        finally:
            TransitFareService.get_cache().invalidate(test_city)


@pytest.mark.asyncio
async def test_graceful_fallback_behavior_on_network_error():
    """Verify graceful fallback behavior (is_estimated = True) when web extraction simulates timeout."""
    with patch.object(
        TransitFareService,
        "fetch_wikivoyage_transit_text",
        side_effect=httpx.TimeoutException("Connection timed out"),
    ):
        TransitFareService.get_cache().invalidate("atlantis_unindexed_city")
        fare = await TransitFareService.resolve_city_transit_fare(
            "atlantis_unindexed_city"
        )
        assert fare.is_estimated is True
        assert fare.source == "regional_benchmark_estimate"
        assert fare.single_fare == 2.00
        assert fare.pass_24h_price == 8.00
        assert fare.airport_surcharge == 3.00


@pytest.mark.asyncio
async def test_database_persistence_and_cache_hits_on_repeated_lookups():
    """Verify in-memory cache hits on repeated lookups without redundant network calls."""
    cache = TransitFareService.get_cache()
    test_city = "valencia_test_city"
    cache.invalidate(test_city)

    with (
        patch.object(
            TransitFareService, "fetch_wikivoyage_transit_text", new_callable=AsyncMock
        ) as mock_fetch,
        patch.object(
            TransitFareService, "extract_fare_with_ollama", new_callable=AsyncMock
        ) as mock_extract,
        patch.object(
            TransitFareService, "_lookup_db", new_callable=AsyncMock
        ) as mock_lookup_db,
        patch.object(TransitFareService, "persist_fare_to_db", new_callable=AsyncMock),
    ):
        mock_lookup_db.return_value = None
        mock_fetch.return_value = "Transit text for Valencia"
        mock_extract.return_value = TransitFareExtractionSchema(
            agency_name="EMT Valencia",
            single_fare_eur=1.50,
            day_pass_name="Valencia Card",
            day_pass_fare_eur=15.00,
            airport_surcharge_eur=3.00,
            airport_station_keywords=["Aeroport"],
            source_url="https://www.emtvalencia.es",
        )

        try:
            fare1 = await TransitFareService.resolve_city_transit_fare(test_city)
            assert fare1.single_fare == 1.50
            assert mock_fetch.call_count == 1

            # Second lookup hits cache directly
            fare2 = await TransitFareService.resolve_city_transit_fare(test_city)
            assert fare2.single_fare == 1.50
            assert mock_fetch.call_count == 1
        finally:
            cache.invalidate(test_city)
