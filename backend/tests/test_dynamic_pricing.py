from app.domain.entities.poi import TransitStep
from app.services.poi_pricing_service import PoiPricingService
from app.services.transit_fare_service import TransitFareService

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
