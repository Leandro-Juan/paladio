"""
Adversarial Verification Suite for calculate_transit_leg_fare & Airport Detection
Empirically tests:
1. MAD Airport -> Sol: total_cost == 4.50, airport_surcharge_eur == 3.00, has_airport is True
2. Non-airport legs across cities and unindexed cities: total_cost == base_fare, airport_surcharge_eur == 0.0
3. Pedestrian legs: total_cost == 0.0, airport_surcharge_eur == 0.0
4. Detection via is_airport_leg=True, origin category "AIRPORT", destination category "AIRPORT", station keywords, multilingual tokens
5. Unpacking compatibility: 4-tuple unpacking, 5-tuple unpacking, property access, aliases, indexing, comprehensions, loops, star unpacking
6. Robustness against corrupt inputs, None values, unusual types, and concurrent invocations
"""

import concurrent.futures

import pytest
from app.domain.entities.poi import TransitStep
from app.services.transit_fare_service import (
    CityTransitFare,
    TransitFareService,
    get_fare_cache,
)


@pytest.fixture(autouse=True)
def setup_test_fares():
    cache = get_fare_cache()
    fares = {
        "madrid": CityTransitFare(
            city="madrid",
            country="Spain",
            currency="EUR",
            single_fare=1.50,
            pass_24h_price=8.40,
            pass_24h_name="Abono Turístico 1 Día (Zona A)",
            pass_24h_includes_airport=True,
            airport_surcharge=3.00,
            airport_station_keywords=[
                "aeropuerto t1-t2-t3",
                "aeropuerto t4",
                "aeropuerto",
                "barajas",
            ],
            is_estimated=False,
            source="official_crtm_tariff",
        ),
        "paris": CityTransitFare(
            city="paris",
            country="France",
            currency="EUR",
            single_fare=2.15,
            pass_24h_price=8.45,
            pass_24h_name="Navigo Jour (Zones 1-2)",
            pass_24h_includes_airport=False,
            airport_surcharge=9.65,
            airport_station_keywords=[
                "aeroport charles de gaulle",
                "aeroport cdg",
                "cdg",
                "roissy",
                "aeroport d'orly",
                "orlyval",
            ],
            is_estimated=False,
            source="official_idfm_tariff",
        ),
        "lisbon": CityTransitFare(
            city="lisbon",
            country="Portugal",
            currency="EUR",
            single_fare=1.80,
            pass_24h_price=6.80,
            pass_24h_name="Bilhete 24h Carris/Metro",
            pass_24h_includes_airport=True,
            airport_surcharge=0.0,
            airport_station_keywords=["aeroporto", "aeroporto de lisboa"],
            is_estimated=False,
            source="official_carris_metro_tariff",
        ),
        "barcelona": CityTransitFare(
            city="barcelona",
            country="Spain",
            currency="EUR",
            single_fare=2.55,
            pass_24h_price=11.20,
            pass_24h_name="Hola Barcelona 24h Travel Card",
            pass_24h_includes_airport=True,
            airport_surcharge=2.95,
            airport_station_keywords=[
                "aeroport t1",
                "aeroport t2",
                "aeroport",
                "el prat",
            ],
            is_estimated=False,
            source="official_tmb_tariff",
        ),
        "rome": CityTransitFare(
            city="rome",
            country="Italy",
            currency="EUR",
            single_fare=1.50,
            pass_24h_price=7.00,
            pass_24h_name="Biglietto 24 Ore ATAC",
            pass_24h_includes_airport=False,
            airport_surcharge=12.50,
            airport_station_keywords=["fiumicino", "aeroporto fiumicino", "ciampino"],
            is_estimated=False,
            source="official_atac_tariff",
        ),
        "tokyo": CityTransitFare(
            city="tokyo",
            country="Japan",
            currency="JPY",
            single_fare=168.0,
            pass_24h_price=800.0,
            pass_24h_name="Tokyo Subway 24-hour Ticket",
            pass_24h_includes_airport=False,
            airport_surcharge=0.0,
            airport_station_keywords=["haneda", "narita", "羽田", "成田"],
            is_estimated=False,
            source="official_tokyo_metro_tariff",
        ),
    }
    for k, v in fares.items():
        cache.set(k, v)
    yield
    for k in fares:
        cache.invalidate(k)


# ============================================================================
# 1. Madrid Airport -> Sol Specific Tests
# ============================================================================


def test_mad_airport_to_sol_explicit_flag():
    """MAD Airport -> Sol with explicit is_airport_leg=True yields total 4.50€ and 3.00€ surcharge."""
    steps = [
        TransitStep(
            type="transit", instruction="Metro Line 8 from Aeropuerto", duration_mins=15
        ),
        TransitStep(
            type="transfer",
            instruction="Transfer at Nuevos Ministerios",
            duration_mins=3,
        ),
        TransitStep(
            type="transit", instruction="Metro Line 10 to Sol", duration_mins=10
        ),
    ]
    res = TransitFareService.calculate_transit_leg_fare(
        "madrid", steps, is_airport_leg=True
    )

    assert res.total_cost == 4.50
    assert res.airport_surcharge_eur == 3.00
    assert res.has_airport is True
    assert res.cost_is_estimated is False
    assert res.price_source == "official_crtm_tariff"


def test_mad_airport_to_sol_origin_category():
    """MAD Airport -> Sol with origin category 'AIRPORT'."""
    steps = [
        TransitStep(type="transit", instruction="Metro Line 8", duration_mins=15),
    ]
    origin = {"category": "AIRPORT", "name": "Adolfo Suárez Madrid-Barajas"}
    destination = {"category": "MONUMENT", "name": "Puerta del Sol"}

    res = TransitFareService.calculate_transit_leg_fare(
        "madrid", steps, origin=origin, destination=destination
    )
    assert res.total_cost == 4.50
    assert res.airport_surcharge_eur == 3.00
    assert res.has_airport is True


def test_mad_sol_to_airport_destination_category():
    """Sol -> MAD Airport with destination category 'AIRPORT'."""
    steps = [
        TransitStep(type="transit", instruction="Metro Line 8", duration_mins=15),
    ]
    origin = {"category": "MONUMENT", "name": "Puerta del Sol"}
    destination = {"category": "AIRPORT", "name": "Madrid Barajas Airport"}

    res = TransitFareService.calculate_transit_leg_fare(
        "madrid", steps, origin=origin, destination=destination
    )
    assert res.total_cost == 4.50
    assert res.airport_surcharge_eur == 3.00
    assert res.has_airport is True


@pytest.mark.parametrize(
    "kw_field,kw_value",
    [
        ("station_name", "Aeropuerto T1-T2-T3"),
        ("station_name", "Aeropuerto T4"),
        ("station_name", "Barajas"),
        ("instruction", "Board Metro Line 8 at Aeropuerto station"),
        ("headsign", "Aeropuerto T4"),
        ("station_name", "Aeropuerto"),
    ],
)
def test_mad_airport_station_keywords(kw_field, kw_value):
    """MAD Airport leg detected via station keywords in step attributes."""
    step_kwargs = {
        "type": "transit",
        "instruction": "Metro Line 8",
        "duration_mins": 12,
    }
    step_kwargs[kw_field] = kw_value
    steps = [TransitStep(**step_kwargs)]

    res = TransitFareService.calculate_transit_leg_fare("madrid", steps)
    assert res.total_cost == 4.50
    assert res.airport_surcharge_eur == 3.00
    assert res.has_airport is True


# ============================================================================
# 2. Non-Airport Legs Across Cities
# ============================================================================


@pytest.mark.parametrize(
    "city,expected_fare",
    [
        ("madrid", 1.50),
        ("paris", 2.15),
        ("lisbon", 1.80),
        ("barcelona", 2.55),
        ("rome", 1.50),
    ],
)
def test_non_airport_legs_verified_cities(city, expected_fare):
    """Non-airport transit legs in verified cities cost exactly base_fare with 0.0 surcharge."""
    steps = [
        TransitStep(type="walk", instruction="Walk to station", duration_mins=5),
        TransitStep(
            type="transit",
            instruction="Take central line",
            duration_mins=10,
            station_name="Central Plaza",
            headsign="Downtown",
        ),
    ]
    origin = {"category": "HOTEL", "name": "City Center Hotel"}
    destination = {"category": "MUSEUM", "name": "National Gallery"}

    res = TransitFareService.calculate_transit_leg_fare(
        city, steps, origin=origin, destination=destination, is_airport_leg=False
    )
    assert res.total_cost == expected_fare
    assert res.airport_surcharge_eur == 0.0


def test_intra_city_leg_with_airport_headsign_does_not_charge_surcharge():
    """An intra-city leg on a line whose train heads toward an airport (e.g. Asakusa Line toward Narita)
    must NOT incur an airport surcharge when neither origin nor destination is an airport."""
    steps = [
        TransitStep(
            type="walk", instruction="Walk to Asakusa Station", duration_mins=5
        ),
        TransitStep(
            type="transit",
            instruction="Take the 浅草線 toward Keisei-narita (京成成田)",
            duration_mins=6,
            station_name="Asakusa (浅草)",
            headsign="京成成田",
            transit_line="Asakusa Line (浅草線)",
        ),
        TransitStep(type="walk", instruction="Walk to Tokyo Skytree", duration_mins=4),
    ]
    origin = {"category": "RESTAURANT", "name": "Asakusa Imahan"}
    destination = {"category": "MONUMENT", "name": "Tokyo Skytree"}

    res = TransitFareService.calculate_transit_leg_fare(
        "tokyo", steps, origin=origin, destination=destination
    )
    assert res.has_airport is False
    assert res.total_cost == 168.0  # Real GTFS base single fare in JPY!
    assert res.currency == "JPY"
    assert res.has_airport is False
    assert res.cost_is_estimated is False


def test_non_airport_unindexed_city_fallback():
    """Non-airport transit leg in an unindexed city falls back to honest fare_unknown with is_estimated=True."""
    steps = [
        TransitStep(type="transit", instruction="Tram 1", duration_mins=10),
    ]
    res = TransitFareService.calculate_transit_leg_fare(
        "Helsinki", steps, is_airport_leg=False
    )
    assert res.total_cost == 0.0
    assert res.airport_surcharge_eur == 0.0
    assert res.has_airport is False
    assert res.cost_is_estimated is True
    assert res.price_source == "fare_unknown"


# ============================================================================
# 3. Pedestrian Legs
# ============================================================================


def test_pedestrian_leg_walk_steps():
    """Pure walk steps yield total_cost == 0.0 and airport_surcharge_eur == 0.0."""
    steps = [
        TransitStep(
            type="walk",
            instruction="Walk through Gran Vía",
            duration_mins=15,
            distance_km=1.1,
        ),
    ]
    res = TransitFareService.calculate_transit_leg_fare("madrid", steps)
    assert res.total_cost == 0.0
    assert res.airport_surcharge_eur == 0.0
    assert res.has_airport is False
    assert res.cost_is_estimated is False
    assert res.price_source == "pedestrian_zero_cost"


def test_pedestrian_leg_empty_steps():
    """Empty steps list yields total_cost == 0.0 and airport_surcharge_eur == 0.0."""
    res = TransitFareService.calculate_transit_leg_fare("madrid", [])
    assert res.total_cost == 0.0
    assert res.airport_surcharge_eur == 0.0
    assert res.has_airport is False
    assert res.cost_is_estimated is False
    assert res.price_source == "pedestrian_zero_cost"


def test_pedestrian_leg_at_airport_without_transit_is_free():
    """Walking inside airport without boarding a transit vehicle is free."""
    steps = [
        TransitStep(
            type="walk", instruction="Walk between T1 and T2", duration_mins=10
        ),
    ]
    origin = {"category": "AIRPORT", "name": "Madrid-Barajas Terminal 1"}
    destination = {"category": "AIRPORT", "name": "Madrid-Barajas Terminal 2"}

    res = TransitFareService.calculate_transit_leg_fare(
        "madrid", steps, origin=origin, destination=destination, is_airport_leg=False
    )
    assert res.total_cost == 0.0
    assert res.airport_surcharge_eur == 0.0
    assert res.has_airport is False
    assert res.price_source == "pedestrian_zero_cost"


# ============================================================================
# 4. Detection Mechanisms & Multilingual Keywords
# ============================================================================


@pytest.mark.parametrize(
    "cat_val",
    ["AIRPORT", "airport", "Airport"],
)
def test_category_case_insensitivity(cat_val):
    """Origin/destination category check is case-insensitive for standard category tokens."""
    steps = [TransitStep(type="transit", instruction="Bus", duration_mins=10)]
    res_orig = TransitFareService.calculate_transit_leg_fare(
        "madrid", steps, origin={"category": cat_val, "name": "Terminal"}
    )
    assert res_orig.has_airport is True
    assert res_orig.airport_surcharge_eur == 3.00

    res_dest = TransitFareService.calculate_transit_leg_fare(
        "madrid", steps, destination={"category": cat_val, "name": "Terminal"}
    )
    assert res_dest.has_airport is True
    assert res_dest.airport_surcharge_eur == 3.00


def test_category_unstripped_whitespace_edge_case():
    """Documents finding where unstripped whitespace in category without airport in name misses detection."""
    steps = [TransitStep(type="transit", instruction="Bus", duration_mins=10)]
    res = TransitFareService.calculate_transit_leg_fare(
        "madrid", steps, origin={"category": "  AIRPORT  ", "name": "Terminal"}
    )
    assert res.has_airport is True


@pytest.mark.parametrize(
    "kw",
    [
        "flughafen",  # German
        "lufthavn",  # Danish / Norwegian
        "lotnisko",  # Polish
        "havalimanı",  # Turkish
        "aéroport",  # French
        "aeroporto",  # Portuguese / Italian
        "aeropuerto",  # Spanish
        "airport",  # English
    ],
)
def test_generic_multilingual_airport_keywords(kw):
    """Generic airport keywords across various languages trigger airport detection."""
    steps = [
        TransitStep(
            type="transit",
            instruction=f"Board shuttle towards {kw} central",
            duration_mins=20,
        )
    ]
    res = TransitFareService.calculate_transit_leg_fare("madrid", steps)
    assert res.has_airport is True
    assert res.airport_surcharge_eur == 3.00
    assert res.total_cost == 4.50


def test_airport_surcharges_across_all_cities():
    """Test airport surcharge and total cost across all 5 verified cities + unindexed."""
    # Paris CDG: 2.15 + 9.65 = 11.80
    paris_res = TransitFareService.calculate_transit_leg_fare(
        "paris",
        [
            TransitStep(
                type="transit",
                instruction="RER B",
                duration_mins=30,
                station_name="Aeroport Charles de Gaulle",
            )
        ],
    )
    assert paris_res.has_airport is True
    assert paris_res.total_cost == 11.80
    assert paris_res.airport_surcharge_eur == 9.65

    # Lisbon: 1.80 + 0.00 = 1.80 (metro covers airport)
    lisbon_res = TransitFareService.calculate_transit_leg_fare(
        "lisbon",
        [
            TransitStep(
                type="transit",
                instruction="Metro Vermelha",
                duration_mins=20,
                station_name="Aeroporto",
            )
        ],
    )
    assert lisbon_res.has_airport is True
    assert lisbon_res.total_cost == 1.80
    assert lisbon_res.airport_surcharge_eur == 0.00

    # Barcelona: 2.55 + 2.95 = 5.50
    bcn_res = TransitFareService.calculate_transit_leg_fare(
        "barcelona",
        [
            TransitStep(
                type="transit",
                instruction="Metro L9S",
                duration_mins=25,
                station_name="Aeroport T1",
            )
        ],
    )
    assert bcn_res.has_airport is True
    assert bcn_res.total_cost == 5.50
    assert bcn_res.airport_surcharge_eur == 2.95

    # Rome: 1.50 + 12.50 = 14.00
    rome_res = TransitFareService.calculate_transit_leg_fare(
        "rome",
        [
            TransitStep(
                type="transit",
                instruction="Leonardo Express",
                duration_mins=32,
                station_name="Fiumicino",
            )
        ],
    )
    assert rome_res.has_airport is True
    assert rome_res.total_cost == 14.00
    assert rome_res.airport_surcharge_eur == 12.50

    # Unindexed city airport leg: honest fare_unknown (0.00 EUR total, 0.00 EUR surcharge, is_estimated=True)
    unknown_res = TransitFareService.calculate_transit_leg_fare(
        "Munich",
        [
            TransitStep(
                type="transit",
                instruction="S-Bahn",
                duration_mins=40,
                station_name="Flughafen",
            )
        ],
    )
    assert unknown_res.has_airport is True
    assert unknown_res.total_cost == 0.00
    assert unknown_res.airport_surcharge_eur == 0.00
    assert unknown_res.cost_is_estimated is True


# ============================================================================
# 5. Typed Dataclass Interface
# ============================================================================


def test_transit_fare_result_typed_attributes():
    """Verify TransitFareResult typed attribute contract."""
    steps = [TransitStep(type="transit", instruction="Metro 8", duration_mins=15)]
    res = TransitFareService.calculate_transit_leg_fare(
        "madrid", steps, is_airport_leg=True
    )

    assert res.total_cost == 4.50
    assert res.cost_is_estimated is False
    assert res.price_source == "official_crtm_tariff"
    assert res.has_airport is True
    assert res.airport_surcharge_eur == 3.00
    assert res.currency == "EUR"


def test_pedestrian_result_attributes():
    """Verify pedestrian zero-cost result typed attributes."""
    res = TransitFareService.calculate_transit_leg_fare("madrid", [])

    assert res.total_cost == 0.0
    assert res.cost_is_estimated is False
    assert res.price_source == "pedestrian_zero_cost"
    assert res.has_airport is False
    assert res.airport_surcharge_eur == 0.0
    assert res.currency == "EUR"


# ============================================================================
# 6. Adversarial Robustness & Edge Cases
# ============================================================================


def test_robustness_none_and_corrupt_dict_values():
    """calculate_transit_leg_fare handles None, non-string, or empty origin/destination gracefully."""
    steps = [TransitStep(type="transit", instruction="Metro 1", duration_mins=10)]

    # None values inside origin / destination
    res1 = TransitFareService.calculate_transit_leg_fare(
        "madrid",
        steps,
        origin={"category": None, "name": None},
        destination={"category": None, "name": None},
    )
    assert res1.total_cost == 1.50
    assert res1.has_airport is False

    # Empty dicts
    res2 = TransitFareService.calculate_transit_leg_fare(
        "madrid", steps, origin={}, destination={}
    )
    assert res2.total_cost == 1.50

    # Non-string types in category/name
    res3 = TransitFareService.calculate_transit_leg_fare(
        "madrid", steps, origin={"category": 999, "name": 12345}
    )
    assert res3.total_cost == 1.50
    assert res3.has_airport is False

    # None step fields
    step_none = TransitStep(
        type="transit",
        instruction="Metro",
        duration_mins=10,
        station_name=None,
        headsign=None,
    )
    res4 = TransitFareService.calculate_transit_leg_fare("madrid", [step_none])
    assert res4.total_cost == 1.50


def test_robustness_city_name_formatting():
    """Handles untrimmed, lowercase, uppercase, and comma-separated city names."""
    steps = [TransitStep(type="transit", instruction="Metro", duration_mins=10)]

    assert (
        TransitFareService.calculate_transit_leg_fare(
            " Madrid, Spain ", steps
        ).total_cost
        == 1.50
    )
    assert (
        TransitFareService.calculate_transit_leg_fare("PARIS, France", steps).total_cost
        == 2.15
    )
    assert (
        TransitFareService.calculate_transit_leg_fare("   lisbon   ", steps).total_cost
        == 1.80
    )
    assert (
        TransitFareService.calculate_transit_leg_fare("BARCELONA", steps).total_cost
        == 2.55
    )
    assert (
        TransitFareService.calculate_transit_leg_fare("Rome, Italy", steps).total_cost
        == 1.50
    )


def test_thread_safety_concurrency():
    """Concurrent calls to calculate_transit_leg_fare across multiple threads do not race or corrupt state."""
    steps_airport = [
        TransitStep(
            type="transit",
            instruction="Metro 8",
            duration_mins=15,
            station_name="Aeropuerto T4",
        )
    ]
    steps_city = [TransitStep(type="transit", instruction="Metro 1", duration_mins=10)]

    def run_worker(i: int):
        if i % 2 == 0:
            res = TransitFareService.calculate_transit_leg_fare("madrid", steps_airport)
            assert res.total_cost == 4.50
            assert res.airport_surcharge_eur == 3.00
            assert res.has_airport is True
        else:
            res = TransitFareService.calculate_transit_leg_fare("madrid", steps_city)
            assert res.total_cost == 1.50
            assert res.airport_surcharge_eur == 0.00
            assert res.has_airport is False
        return True

    with concurrent.futures.ThreadPoolExecutor(max_workers=8) as executor:
        futures = [executor.submit(run_worker, i) for i in range(100)]
        results = [f.result() for f in concurrent.futures.as_completed(futures)]
        assert all(results)


if __name__ == "__main__":
    import sys

    print("Running adversarial test suite via direct python execution...")
    pytest_exit = pytest.main([__file__, "-v"])
    sys.exit(pytest_exit)
