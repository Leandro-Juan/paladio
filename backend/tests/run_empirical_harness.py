#!/usr/bin/env python3
"""
Standalone Empirical Challenger Verification Harness for Transit Fare Calculation & Airport Surcharge Handling.
Directly executes all challenge dimensions and reports status.
"""

import concurrent.futures
import time

from app.domain.entities.poi import TransitStep
from app.services.transit_fare_service import TransitFareService


def log_test(name: str, passed: bool, detail: str = ""):
    status = "PASS" if passed else "FAIL"
    print(f"[{status}] {name}{': ' + detail if detail else ''}")
    if not passed:
        raise AssertionError(f"Test failed: {name} - {detail}")


def run_all_challenges():
    print("=" * 70)
    print("STARTING EMPIRICAL CHALLENGER VERIFICATION HARNESS")
    print("=" * 70)

    # ------------------------------------------------------------------------
    # Challenge 1: Madrid Airport -> Sol Fare Calculation
    # ------------------------------------------------------------------------
    print("\n--- Challenge 1: Madrid Airport -> Sol ---")
    steps = [TransitStep(type="transit", instruction="Metro Line 8", duration_mins=15)]

    # 1.1 Explicit flag
    res1 = TransitFareService.calculate_transit_leg_fare(
        "madrid", steps, is_airport_leg=True
    )
    log_test(
        "MAD Airport -> Sol (is_airport_leg=True)",
        res1.total_cost == 4.50
        and res1.airport_surcharge_eur == 3.00
        and res1.has_airport is True,
        f"cost={res1.total_cost}, surcharge={res1.airport_surcharge_eur}, has_airport={res1.has_airport}",
    )

    # 1.2 Origin category AIRPORT
    res2 = TransitFareService.calculate_transit_leg_fare(
        "madrid", steps, origin={"category": "AIRPORT", "name": "Madrid-Barajas"}
    )
    log_test(
        "MAD Airport -> Sol (origin category 'AIRPORT')",
        res2.total_cost == 4.50
        and res2.airport_surcharge_eur == 3.00
        and res2.has_airport is True,
        f"cost={res2.total_cost}, surcharge={res2.airport_surcharge_eur}, has_airport={res2.has_airport}",
    )

    # 1.3 Destination category AIRPORT
    res3 = TransitFareService.calculate_transit_leg_fare(
        "madrid", steps, destination={"category": "AIRPORT", "name": "Barajas"}
    )
    log_test(
        "MAD Sol -> Airport (destination category 'AIRPORT')",
        res3.total_cost == 4.50
        and res3.airport_surcharge_eur == 3.00
        and res3.has_airport is True,
        f"cost={res3.total_cost}, surcharge={res3.airport_surcharge_eur}, has_airport={res3.has_airport}",
    )

    # 1.4 Station keywords
    for kw in ["Aeropuerto T1-T2-T3", "Aeropuerto T4", "Barajas"]:
        kw_steps = [
            TransitStep(
                type="transit", instruction="Metro", duration_mins=10, station_name=kw
            )
        ]
        res_kw = TransitFareService.calculate_transit_leg_fare("madrid", kw_steps)
        log_test(
            f"MAD Airport detection via station_name='{kw}'",
            res_kw.total_cost == 4.50
            and res_kw.airport_surcharge_eur == 3.00
            and res_kw.has_airport is True,
            f"cost={res_kw.total_cost}, surcharge={res_kw.airport_surcharge_eur}",
        )

    # ------------------------------------------------------------------------
    # Challenge 2: Non-Airport Legs
    # ------------------------------------------------------------------------
    print("\n--- Challenge 2: Non-Airport Legs ---")
    verified_cities = [
        ("madrid", 1.50),
        ("paris", 2.15),
        ("lisbon", 1.80),
        ("barcelona", 2.55),
        ("rome", 1.50),
    ]
    city_steps = [
        TransitStep(type="transit", instruction="Metro line 1", duration_mins=12)
    ]
    origin_city = {"category": "HOTEL", "name": "Central Hotel"}
    dest_city = {"category": "MUSEUM", "name": "Fine Arts Museum"}

    for city, expected_fare in verified_cities:
        res_city = TransitFareService.calculate_transit_leg_fare(
            city,
            city_steps,
            origin=origin_city,
            destination=dest_city,
            is_airport_leg=False,
        )
        log_test(
            f"Non-airport leg in {city.title()}",
            res_city.total_cost == expected_fare
            and res_city.airport_surcharge_eur == 0.0
            and res_city.has_airport is False,
            f"cost={res_city.total_cost}, surcharge={res_city.airport_surcharge_eur}, has_airport={res_city.has_airport}",
        )

    # Unindexed city
    res_unknown = TransitFareService.calculate_transit_leg_fare(
        "Stockholm", city_steps, is_airport_leg=False
    )
    log_test(
        "Non-airport leg in unindexed city (Stockholm)",
        res_unknown.total_cost == 2.00
        and res_unknown.airport_surcharge_eur == 0.0
        and res_unknown.cost_is_estimated is True,
        f"cost={res_unknown.total_cost}, is_estimated={res_unknown.cost_is_estimated}",
    )

    # ------------------------------------------------------------------------
    # Challenge 3: Pedestrian Legs
    # ------------------------------------------------------------------------
    print("\n--- Challenge 3: Pedestrian Legs ---")
    walk_steps = [
        TransitStep(
            type="walk", instruction="Walk 500m", duration_mins=6, distance_km=0.5
        )
    ]
    res_walk = TransitFareService.calculate_transit_leg_fare("madrid", walk_steps)
    log_test(
        "Pedestrian walking leg (total_cost == 0.0, surcharge == 0.0)",
        res_walk.total_cost == 0.0
        and res_walk.airport_surcharge_eur == 0.0
        and res_walk.price_source == "pedestrian_zero_cost",
        f"cost={res_walk.total_cost}, source={res_walk.price_source}",
    )

    res_empty = TransitFareService.calculate_transit_leg_fare("madrid", [])
    log_test(
        "Empty steps list (total_cost == 0.0, surcharge == 0.0)",
        res_empty.total_cost == 0.0 and res_empty.airport_surcharge_eur == 0.0,
        f"cost={res_empty.total_cost}",
    )

    res_airport_walk = TransitFareService.calculate_transit_leg_fare(
        "madrid",
        walk_steps,
        origin={"category": "AIRPORT", "name": "T1"},
        destination={"category": "AIRPORT", "name": "T2"},
    )
    log_test(
        "Airport pedestrian walk without transit vehicle (free)",
        res_airport_walk.total_cost == 0.0
        and res_airport_walk.airport_surcharge_eur == 0.0,
        f"cost={res_airport_walk.total_cost}, surcharge={res_airport_walk.airport_surcharge_eur}",
    )

    # ------------------------------------------------------------------------
    # Challenge 4: Airport Detection Mechanisms & Keywords
    # ------------------------------------------------------------------------
    print("\n--- Challenge 4: Airport Detection Mechanisms ---")
    for cat in ["AIRPORT", "airport", "Airport"]:
        res_c = TransitFareService.calculate_transit_leg_fare(
            "madrid", steps, origin={"category": cat, "name": "Station"}
        )
        log_test(
            f"Case insensitivity category='{cat}'",
            res_c.has_airport is True and res_c.airport_surcharge_eur == 3.00,
            f"has_airport={res_c.has_airport}",
        )

    for lang, kw in [
        ("German", "flughafen"),
        ("Danish/Norwegian", "lufthavn"),
        ("Polish", "lotnisko"),
        ("Turkish", "havalimanı"),
        ("French", "aéroport"),
        ("Portuguese/Italian", "aeroporto"),
    ]:
        kw_step = [
            TransitStep(type="transit", instruction=f"Train to {kw}", duration_mins=15)
        ]
        res_lang = TransitFareService.calculate_transit_leg_fare("madrid", kw_step)
        log_test(
            f"Multilingual token ({lang}: '{kw}')",
            res_lang.has_airport is True and res_lang.airport_surcharge_eur == 3.00,
            f"has_airport={res_lang.has_airport}",
        )

    # ------------------------------------------------------------------------
    # Challenge 5: Unpacking Compatibility & Interface Completeness
    # ------------------------------------------------------------------------
    print("\n--- Challenge 5: Unpacking Compatibility ---")
    test_res = TransitFareService.calculate_transit_leg_fare(
        "madrid", steps, is_airport_leg=True
    )

    # 5.1 4-tuple unpacking
    c4, e4, s4, a4 = test_res
    log_test(
        "4-tuple unpacking (c, e, s, a = res)",
        (c4, e4, s4, a4) == (4.50, False, "official_crtm_tariff", True),
        f"c4={c4}, e4={e4}, s4={s4}, a4={a4}",
    )

    # 5.2 5-tuple unpacking
    c5, e5, s5, a5, sur5 = test_res
    log_test(
        "5-tuple unpacking (c, e, s, a, sur = res)",
        (c5, e5, s5, a5, sur5) == (4.50, False, "official_crtm_tariff", True, 3.00),
        f"c5={c5}, sur5={sur5}",
    )

    # 5.3 Property access & aliases
    log_test(
        "Property access (.total_cost, .airport_surcharge_eur, .cost, .source)",
        test_res.total_cost == 4.50
        and test_res.airport_surcharge_eur == 3.00
        and test_res.cost == 4.50
        and test_res.source == "official_crtm_tariff",
        f"total_cost={test_res.total_cost}, surcharge={test_res.airport_surcharge_eur}",
    )

    # 5.4 Comprehensions and Loops
    list_comp_4 = [(c, e, s, a) for c, e, s, a in [test_res]]
    list_comp_5 = [(c, e, s, a, sur) for c, e, s, a, sur in [test_res]]
    log_test(
        "Comprehension unpacking (4-item & 5-item)",
        len(list_comp_4) == 1 and len(list_comp_4[0]) == 4 and len(list_comp_5[0]) == 5,
        f"comp4={list_comp_4}, comp5={list_comp_5}",
    )

    # 5.5 Star unpacking
    first, *mid, last = test_res
    log_test(
        "Star unpacking (first, *mid, last = res)",
        first == 4.50 and len(mid) == 3 and last == 3.00,
        f"first={first}, mid={mid}, last={last}",
    )

    # 5.6 Invalid unpacking raises ValueError
    val_err_caught = False
    try:
        _c, _e, _s = test_res
    except ValueError:
        val_err_caught = True
    log_test(
        "Invalid 3-item unpacking raises ValueError",
        val_err_caught,
        "ValueError raised as expected",
    )

    # ------------------------------------------------------------------------
    # Challenge 6: Stress & Concurrency Robustness
    # ------------------------------------------------------------------------
    print("\n--- Challenge 6: Stress & Concurrency Robustness ---")

    def worker_fn(i: int) -> bool:
        if i % 2 == 0:
            r = TransitFareService.calculate_transit_leg_fare(
                "madrid", steps, is_airport_leg=True
            )
            return r.total_cost == 4.50 and r.airport_surcharge_eur == 3.00
        else:
            r = TransitFareService.calculate_transit_leg_fare(
                "paris", steps, is_airport_leg=False
            )
            return r.total_cost == 2.15 and r.airport_surcharge_eur == 0.00

    start_t = time.perf_counter()
    with concurrent.futures.ThreadPoolExecutor(max_workers=8) as pool:
        results = list(pool.map(worker_fn, range(200)))
    elapsed = time.perf_counter() - start_t
    log_test(
        "Concurrent multi-threaded stress test (200 ops across 8 threads)",
        all(results),
        f"200 calls completed in {elapsed * 1000:.2f} ms (avg {elapsed * 1000 / 200:.3f} ms/call)",
    )

    print("\n" + "=" * 70)
    print("ALL EMPIRICAL CHALLENGE ASSERTIONS VERIFIED SUCCESSFULLY!")
    print("=" * 70)


if __name__ == "__main__":
    run_all_challenges()
