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
    TransitFareResult,
    TransitFareService,
)

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
    assert res.has_airport is False
    assert res.cost_is_estimated is False


def test_non_airport_unindexed_city_fallback():
    """Non-airport transit leg in an unindexed city falls back to 2.00 EUR baseline with is_estimated=True."""
    steps = [
        TransitStep(type="transit", instruction="Tram 1", duration_mins=10),
    ]
    res = TransitFareService.calculate_transit_leg_fare(
        "Helsinki", steps, is_airport_leg=False
    )
    assert res.total_cost == 2.00
    assert res.airport_surcharge_eur == 0.0
    assert res.has_airport is False
    assert res.cost_is_estimated is True
    assert res.price_source == "regional_benchmark_estimate"


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

    # Unindexed city airport leg: 2.00 + 3.00 = 5.00, is_estimated=True
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
    assert unknown_res.total_cost == 5.00
    assert unknown_res.airport_surcharge_eur == 3.00
    assert unknown_res.cost_is_estimated is True


# ============================================================================
# 5. Unpacking Compatibility & Interface Completeness
# ============================================================================


def test_4_tuple_unpacking():
    """Verify legacy 4-tuple unpacking: c, e, s, a = res."""
    steps = [TransitStep(type="transit", instruction="Metro 8", duration_mins=15)]
    res = TransitFareService.calculate_transit_leg_fare(
        "madrid", steps, is_airport_leg=True
    )

    c, e, s, a = res
    assert c == 4.50
    assert e is False
    assert s == "official_crtm_tariff"
    assert a is True


def test_5_tuple_unpacking():
    """Verify modern 5-tuple unpacking: c, e, s, a, sur = res."""
    steps = [TransitStep(type="transit", instruction="Metro 8", duration_mins=15)]
    res = TransitFareService.calculate_transit_leg_fare(
        "madrid", steps, is_airport_leg=True
    )

    c, e, s, a, sur = res
    assert c == 4.50
    assert e is False
    assert s == "official_crtm_tariff"
    assert a is True
    assert sur == 3.00


def test_property_access_and_aliases():
    """Verify named properties and backwards-compatible aliases."""
    steps = [TransitStep(type="transit", instruction="Metro 8", duration_mins=15)]
    res = TransitFareService.calculate_transit_leg_fare(
        "madrid", steps, is_airport_leg=True
    )

    # Primary named properties
    assert res.total_cost == 4.50
    assert res.cost_is_estimated is False
    assert res.price_source == "official_crtm_tariff"
    assert res.has_airport is True
    assert res.airport_surcharge_eur == 3.00

    # Aliases
    assert res.cost == 4.50
    assert res.is_estimated is False
    assert res.source == "official_crtm_tariff"

    # Indexing
    assert res[0] == 4.50
    assert res[1] is False
    assert res[2] == "official_crtm_tariff"
    assert res[3] is True
    assert res[4] == 3.00


def test_unpacking_in_comprehensions_and_loops():
    """Verify 4-tuple and 5-tuple unpacking inside list comprehensions, generators, and for-loops."""
    steps = [TransitStep(type="transit", instruction="Metro 8", duration_mins=15)]
    res = TransitFareService.calculate_transit_leg_fare(
        "madrid", steps, is_airport_leg=True
    )

    # List comprehension 4-tuple
    res_list_4 = [(c, e, s, a) for c, e, s, a in [res]]
    assert res_list_4 == [(4.50, False, "official_crtm_tariff", True)]

    # List comprehension 5-tuple
    res_list_5 = [(c, e, s, a, sur) for c, e, s, a, sur in [res]]
    assert res_list_5 == [(4.50, False, "official_crtm_tariff", True, 3.00)]

    # List comprehension 4-tuple
    g4 = [(c, a) for c, e, s, a in (res,)]
    assert g4 == [(4.50, True)]

    # List comprehension 5-tuple
    g5 = [(c, sur) for c, e, s, a, sur in (res,)]
    assert g5 == [(4.50, 3.00)]

    # For-loop 4-tuple
    for c, e, s, a in [res]:
        assert (c, e, s, a) == (4.50, False, "official_crtm_tariff", True)

    # For-loop 5-tuple
    for c, e, s, a, sur in [res]:
        assert (c, e, s, a, sur) == (4.50, False, "official_crtm_tariff", True, 3.00)

    # Star unpacking
    c, *mid, sur = res
    assert c == 4.50
    assert mid == [False, "official_crtm_tariff", True]
    assert sur == 3.00


def test_pedestrian_result_unpacking():
    """Verify unpacking compatibility on pedestrian zero-cost results."""
    res = TransitFareService.calculate_transit_leg_fare("madrid", [])

    c4, e4, s4, a4 = res
    assert (c4, e4, s4, a4) == (0.0, False, "pedestrian_zero_cost", False)

    c5, e5, s5, a5, sur5 = res
    assert (c5, e5, s5, a5, sur5) == (0.0, False, "pedestrian_zero_cost", False, 0.0)

    assert res.total_cost == 0.0
    assert res.airport_surcharge_eur == 0.0


def test_invalid_unpacking_raises_value_error():
    """Unpacking 3 or 6 elements raises standard Python ValueError."""
    res = TransitFareResult(4.5, False, "official_crtm_tariff", True, 3.0)

    with pytest.raises(ValueError, match="too many values to unpack"):
        _c, _e, _s = res

    with pytest.raises(ValueError, match="not enough values to unpack"):
        _c, _e, _s, _a, _sur, _extra = res


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
