import time
from typing import Any
from unittest.mock import AsyncMock, patch

from app.bench.metrics import (
    calculate_budget_overrun,
    calculate_category_entropy,
    calculate_load_variance,
    calculate_zigzag_ratio,
    detect_closure_violations,
    detect_idle_time_violations,
    detect_meal_spacing_violations,
    evaluate_tier1_recall,
)
from app.bench.scenarios import (
    CITY_CENTERS,
    MANDATORY_POIS,
    build_scenario_constraints,
    load_bench_fixtures,
)
from app.domain.entities.poi import Poi, PoiLocation, TransitLeg, TransitStep
from app.domain.interfaces.poi_repository import IPoiRepository
from app.engine.transit_matrix import haversine_distance
from app.engine.v2.pipeline import run_itinerary_v2_pipeline
from app.engine.v2.tiering import classify_poi_tier
from app.infrastructure.engine.bridge_adapter import CppOptimizationAdapter
from app.infrastructure.providers.travel_data import DefaultTravelDataProvider
from app.use_cases.fetch_travel_context import FetchTravelContextUseCase
from app.use_cases.optimize_daily_itinerary import OptimizeDailyItineraryUseCase

TIER1_SEEDS = {
    "Paris": [
        "Catacombes de Paris",
        "Pont Alexandre III",
        "Conciergerie",
        "Maison de Victor Hugo",
        "Bibliothèque-Musée de l'Opéra",
        "Musée de la Musique",
    ],
    "Madrid": [
        "Museo Arqueológico Nacional",
        "Andén Cero - Estación de Chamberí",
        "Casa Museo del Ratón Pérez",
        "Casa de Cervantes",
        "Mirador del Templo de Debod",
        "Museo Casa de la Moneda",
    ],
    "Lisbon": [
        "Aqueduto das Águas Livres",
        "Miradouro do Castelo de São Jorge",
        "Casa Fernando Pessoa",
        "Lisboa Story Center",
        "Museu Geológico",
        "Museu do Aljube - Resistência e Liberdade",
    ],
}


class BenchPoiRepository(IPoiRepository):
    """In-memory hermetic repository backed by benchmark fixtures."""

    def __init__(
        self,
        attractions: list[dict[str, Any]],
        restaurants: list[dict[str, Any]],
        city: str,
    ):
        self.city = city
        self.pois: list[Poi] = []
        for a in attractions:
            tier_info = classify_poi_tier(a, city)
            loc = a.get("location", {})
            lat = loc.get("latitude", a.get("lat", 0.0))
            lon = loc.get("longitude", a.get("lon", 0.0))
            self.pois.append(
                Poi(
                    id=str(a.get("id") or a.get("name")),
                    name=a.get("name", "Attraction"),
                    city=city,
                    category=a.get("category", "attraction"),
                    location=PoiLocation(latitude=lat, longitude=lon),
                    open_time_mins_by_day=a.get("open_time_mins_by_day", [480] * 7),
                    close_time_mins_by_day=a.get("close_time_mins_by_day", [1320] * 7),
                    duration_mins=int(a.get("duration_mins", 60)),
                    cost_eur=float(a.get("cost_eur", 0.0)),
                    tier=tier_info["tier"],
                    tier_confidence=tier_info["tier_confidence"],
                    tier_source=tier_info["tier_source"],
                    iconicity_score=tier_info["iconicity_score"],
                    taxonomy_category=tier_info["taxonomy_category"],
                    category_id=tier_info["category_id"],
                    visit_mode=tier_info["visit_mode"],
                )
            )
        for r in restaurants:
            loc = r.get("location", {})
            lat = loc.get("latitude", r.get("lat", 0.0))
            lon = loc.get("longitude", r.get("lon", 0.0))
            self.pois.append(
                Poi(
                    id=str(r.get("id") or r.get("name")),
                    name=r.get("name", "Restaurant"),
                    city=city,
                    category="RESTAURANT",
                    location=PoiLocation(latitude=lat, longitude=lon),
                    open_time_mins_by_day=r.get("open_time_mins_by_day", [660] * 7),
                    close_time_mins_by_day=r.get("close_time_mins_by_day", [1380] * 7),
                    duration_mins=int(r.get("duration_mins", 60)),
                    cost_eur=float(r.get("cost_eur", 18.0)),
                    tier=3,
                    iconicity_score=0.5,
                    taxonomy_category="food_culinary",
                    category_id=5,
                )
            )

    async def find_by_city(self, city_name: str) -> list[Poi]:
        return [p for p in self.pois if p.city.lower() == city_name.lower()]

    async def find_tiered_pois(self, city: str, max_tier: int = 2) -> list[Poi]:
        return [
            p
            for p in self.pois
            if p.city.lower() == city.lower() and p.tier <= max_tier
        ]

    async def find_meal_spots(self, city_name: str, limit: int = 400) -> list[Poi]:
        return [
            p
            for p in self.pois
            if p.city.lower() == city_name.lower()
            and p.category.upper() == "RESTAURANT"
        ][:limit]

    async def find_semantic_candidates(
        self, city_name: str, user_vector: list[float] | None = None, limit: int = 150
    ) -> list[tuple[Poi, float]]:
        matching = [p for p in self.pois if p.city.lower() == city_name.lower()]
        return [(p, 0.85) for p in matching[:limit]]

    async def get_by_name(self, name: str, city: str | None = None) -> Poi | None:
        for p in self.pois:
            if p.name.lower() == name.lower():
                return p
        return None

    async def save_all_for_city(self, city_name: str, pois: list[Poi]) -> None:
        pass

    async def save_tiered_for_city(self, city_name: str, records: list[dict]) -> None:
        pass

    async def update_poi_embeddings(
        self, updates: list[tuple[str, list[float]]]
    ) -> None:
        pass


def _fast_transit_matrix(pois, city, departure_dt=None):
    n = len(pois)
    locations = []
    for p in pois:
        lat = p.get("location", {}).get("latitude", p.get("lat", 0.0))
        lon = p.get("location", {}).get("longitude", p.get("lon", 0.0))
        locations.append({"lat": lat, "lon": lon})

    matrix = [
        [{"duration_mins": 0, "cost_eur": 0.0, "mode": "none"} for _ in range(n)]
        for _ in range(n)
    ]
    for i in range(n):
        for j in range(n):
            if i == j:
                continue
            dist = haversine_distance(
                locations[i]["lat"],
                locations[i]["lon"],
                locations[j]["lat"],
                locations[j]["lon"],
            )
            if dist > 1.2:
                dur = int((dist / 25.0 * 60) + 6)
                cost = 1.50
                mode = "transit"
            else:
                dur = int(dist / 4.8 * 60)
                cost = 0.0
                mode = "pedestrian"
            matrix[i][j] = {
                "duration_mins": max(1, dur),
                "cost_eur": cost,
                "mode": mode,
            }
    return matrix


_MOCK_TRANSIT_LEG = TransitLeg(
    duration_mins=15,
    cost_eur=1.50,
    mode="transit",
    steps=[
        TransitStep(
            type="walk",
            instruction="Walk to stop",
            duration_mins=5,
            distance_km=0.3,
        ),
        TransitStep(
            type="transit",
            instruction="Take Metro",
            duration_mins=10,
            distance_km=2.0,
            transit_line="M1",
        ),
    ],
)


def _parse_time_mins(t_val: Any) -> int | None:
    if isinstance(t_val, int):
        return t_val
    if not isinstance(t_val, str) or ":" not in t_val:
        return None
    try:
        parts = t_val.split(":")
        return int(parts[0]) * 60 + int(parts[1])
    except Exception:
        return None


async def run_single_scenario_benchmark(
    scenario: dict[str, Any],
    baseline_mode: str = "as_is",
    travel_fixtures: dict[str, list[dict[str, Any]]] | None = None,
) -> dict[str, Any]:
    """Runs a single scenario against the legacy pipeline with hermetic fixtures and evaluates all metrics."""
    if travel_fixtures is None:
        travel_fixtures = load_bench_fixtures()

    city = scenario["city"]
    duration = scenario["duration"]
    pace = scenario["pace"]
    profile = scenario["profile"]
    scenario_id = scenario.get(
        "scenario_id", f"{city.lower()}_{duration}d_{pace.lower()}_{profile}"
    )

    all_pois = travel_fixtures.get(city, [])
    # Separate attractions and meals
    attractions = [
        p
        for p in all_pois
        if not p.get("is_breakfast_spot")
        and not p.get("is_lunch_spot")
        and not p.get("is_dinner_spot")
    ]
    restaurants = [
        p
        for p in all_pois
        if p.get("is_breakfast_spot")
        or p.get("is_lunch_spot")
        or p.get("is_dinner_spot")
    ]

    constraints = build_scenario_constraints(
        city=city,
        duration=duration,
        pace=pace,
        profile=profile,
    )

    # Candidate pool exhaustion check (for e.g. 14 days with ~35 POIs)
    # Target capacity ~ 4 POIs per day
    needed_pois = duration * 3
    candidate_pool_exhausted = len(attractions) < needed_pois

    mono_threshold = 2
    mono_multiplier = 0.5

    if baseline_mode == "v2":
        bench_repo = BenchPoiRepository(attractions, restaurants, city)
        t0 = time.perf_counter()
        v2_res = await run_itinerary_v2_pipeline(
            city=city,
            constraints=constraints,
            poi_repo=bench_repo,
            transit_matrix_fn=_fast_transit_matrix,
        )
        latency_ms = (time.perf_counter() - t0) * 1000.0
        itinerary = {
            "days": v2_res.days,
            "total_trip_cost": v2_res.summary.total_cost_eur,
        }
    else:
        # Configure monotony parameters according to baseline mode
        if baseline_mode == "no_monotony":
            mono_threshold = 50
            mono_multiplier = 1.0
        else:  # as_is
            mono_threshold = 2
            mono_multiplier = 0.5

        data_provider = DefaultTravelDataProvider(
            test_data={"pois": attractions, "restaurants": restaurants}
        )
        fetch_uc = FetchTravelContextUseCase(
            data_provider=data_provider, ml_scorer=None
        )

        adapter = CppOptimizationAdapter(
            ml_scorer=None,
            monotony_threshold=mono_threshold,
            monotony_multiplier=mono_multiplier,
        )
        opt_uc = OptimizeDailyItineraryUseCase(engine=adapter)

        c_info = CITY_CENTERS.get(city, CITY_CENTERS["Madrid"])
        mock_city_centers = {city.lower(): (c_info["lat"], c_info["lon"])}

        from unittest.mock import MagicMock

        mock_resp = MagicMock()
        mock_resp.status_code = 200
        mock_resp.json.return_value = [
            {"lat": str(c_info["lat"]), "lon": str(c_info["lon"])}
        ]

        t0 = time.perf_counter()
        with (
            patch(
                "app.use_cases.fetch_travel_context.KNOWN_CITY_CENTERS",
                mock_city_centers,
            ),
            patch(
                "app.use_cases.optimize_daily_itinerary.get_transit_matrix",
                side_effect=_fast_transit_matrix,
            ),
            patch(
                "app.services.transit_service.get_detailed_transit_leg",
                new_callable=AsyncMock,
                return_value=_MOCK_TRANSIT_LEG,
            ),
            patch(
                "httpx.AsyncClient.get",
                new_callable=AsyncMock,
                return_value=mock_resp,
            ),
            patch(
                "app.tasks.async_trigger_city_gtfs_download_if_needed",
                new_callable=AsyncMock,
            ),
            patch(
                "app.engine.transit_matrix.ensure_transit_ready",
                new_callable=AsyncMock,
                return_value=True,
            ),
        ):
            context = await fetch_uc.execute(constraints)
            daily_pois = context.get("daily_pois_data", [])
            outbound = context.get("outbound_flight")
            return_flight = context.get("return_flight")

            itinerary = await opt_uc.execute(
                constraints, daily_pois, outbound, return_flight
            )
        latency_ms = (time.perf_counter() - t0) * 1000.0

    # Extract results and evaluate metrics
    days = itinerary.get("days", [])
    scheduled_nodes = []
    scheduled_poi_names = set()
    daily_loads = []
    daily_idle_mins = []
    zigzag_ratios = []
    categories = []
    total_travel_mins = 0
    node_cap_violations = 0

    for d_idx, day_data in enumerate(days):
        itin_data = day_data.get("itinerary", day_data)
        path_items = (
            itin_data.get("path", [])
            if isinstance(itin_data, dict)
            else getattr(itin_data, "path", [])
        )
        if not path_items and "pois" in day_data:
            path_items = [{"poi": p} for p in day_data.get("pois", [])]

        if len(path_items) > 64:
            node_cap_violations += 1

        day_coords = []
        day_active_mins = 0
        day_transit_mins = 0
        day_idle = 0
        prev_end_mins = None

        for item in path_items:
            item_dict = (
                item.model_dump()
                if hasattr(item, "model_dump")
                else (item if isinstance(item, dict) else {"poi": item})
            )
            p_raw = item_dict.get("poi", item_dict)
            p = (
                p_raw.model_dump()
                if hasattr(p_raw, "model_dump")
                else (p_raw if isinstance(p_raw, dict) else {})
            )
            name = p.get("name", "")
            is_depot = p.get("category") in ("HOTEL", "AIRPORT")
            if not is_depot:
                scheduled_poi_names.add(name)

            loc = p.get("location", {})
            lat = loc.get("latitude", loc.get("lat", 0.0))
            lon = loc.get("longitude", loc.get("lon", 0.0))
            if lat != 0.0 and lon != 0.0:
                day_coords.append((lat, lon))

            cat = p.get("category", "")
            if cat and not is_depot:
                categories.append(cat)

            dur = p.get("duration_mins", 60)
            if not is_depot:
                day_active_mins += dur

            # Extract start and end times
            s_start = item_dict.get("scheduled_start")
            s_end = item_dict.get("scheduled_end")
            arr_time = (
                _parse_time_mins(s_start)
                if s_start is not None
                else p.get("arrival_time_mins")
            )
            dep_time = (
                _parse_time_mins(s_end)
                if s_end is not None
                else p.get("departure_time_mins")
            )

            # Transit leg from previous
            transit_info = item_dict.get("transit_from_previous") or {}
            leg_dur = (
                transit_info.get("duration_mins", 0)
                if isinstance(transit_info, dict)
                else getattr(transit_info, "duration_mins", 0)
            )
            day_transit_mins += leg_dur

            # Idle time between previous departure and current arrival
            if prev_end_mins is not None and arr_time is not None:
                gap = arr_time - prev_end_mins - leg_dur
                if gap > 0:
                    day_idle += gap
            if dep_time is not None:
                prev_end_mins = dep_time

            scheduled_nodes.append(
                {
                    "name": name,
                    "weekday": d_idx % 7,
                    "is_meal": p.get("is_breakfast_spot")
                    or p.get("is_lunch_spot")
                    or p.get("is_dinner_spot"),
                    "open_time_mins_by_day": p.get("open_time_mins_by_day"),
                    "close_time_mins_by_day": p.get("close_time_mins_by_day"),
                    "arrival_time_mins": arr_time,
                    "departure_time_mins": dep_time,
                }
            )

        daily_loads.append(day_active_mins)
        daily_idle_mins.append(day_idle)
        total_travel_mins += day_transit_mins

        if len(day_coords) >= 3:
            zigzag_ratios.append(calculate_zigzag_ratio(day_coords))
        else:
            zigzag_ratios.append(1.0)

    # User mandatory satisfaction
    mand_poi = MANDATORY_POIS.get(city)
    user_mandatory_satisfied = bool(
        mand_poi
        and any(
            mand_poi.lower() in name.lower() or name.lower() in mand_poi.lower()
            for name in scheduled_poi_names
        )
    )

    # Tier 1 recall
    tier1_list = TIER1_SEEDS.get(city, [])
    t1_recall = evaluate_tier1_recall(list(scheduled_poi_names), tier1_list)

    # Realism & violation metrics
    closure_viols = detect_closure_violations(scheduled_nodes)
    meal_viols = detect_meal_spacing_violations(scheduled_nodes)
    idle_viols = detect_idle_time_violations(daily_idle_mins)
    load_var = calculate_load_variance(daily_loads)
    cat_entropy = calculate_category_entropy(categories)
    mean_zigzag = sum(zigzag_ratios) / len(zigzag_ratios) if zigzag_ratios else 1.0
    avg_travel_mins = total_travel_mins / max(1, len(days))

    total_cost = itinerary.get("total_trip_cost", 0.0)
    budget_overrun = calculate_budget_overrun(total_cost, constraints.budget_usd * 0.92)

    return {
        "scenario_id": scenario_id,
        "city": city,
        "duration": duration,
        "pace": pace,
        "profile": profile,
        "baseline_mode": baseline_mode,
        "monotony_threshold": mono_threshold,
        "monotony_multiplier": mono_multiplier,
        "tier_1_recall": round(t1_recall, 4),
        "user_mandatory_satisfaction": 1.0 if user_mandatory_satisfied else 0.0,
        "closure_violations": closure_viols,
        "node_cap_violations": node_cap_violations,
        "zigzag_ratio": round(mean_zigzag, 3),
        "travel_minutes_per_day": round(avg_travel_mins, 1),
        "load_variance": round(load_var, 1),
        "bundle_splits": 0,
        "category_entropy": round(cat_entropy, 3),
        "budget_overrun": round(budget_overrun, 2),
        "candidate_pool_exhausted": candidate_pool_exhausted,
        "meal_spacing_violations": meal_viols,
        "idle_time_violations": idle_viols,
        "latency_ms": round(latency_ms, 1),
        "scheduled_poi_count": len(scheduled_poi_names),
        "total_cost": round(total_cost, 2),
    }


async def run_baseline_benchmark_matrix(
    scenarios: list[dict[str, Any]] | None = None,
    baseline_modes: list[str] | None = None,
) -> dict[str, Any]:
    """Runs the benchmark matrix across all scenarios and baseline modes, computing summary stats."""
    if scenarios is None:
        from app.bench.scenarios import get_scenario_matrix

        scenarios = get_scenario_matrix()
    if baseline_modes is None:
        baseline_modes = ["as_is", "no_monotony"]

    fixtures = load_bench_fixtures()
    results: dict[str, list[dict[str, Any]]] = {m: [] for m in baseline_modes}

    for mode in baseline_modes:
        print(
            f"Starting baseline mode: {mode} ({len(scenarios)} scenarios)...",
            flush=True,
        )
        for idx, sc in enumerate(scenarios):
            res = await run_single_scenario_benchmark(
                sc, baseline_mode=mode, travel_fixtures=fixtures
            )
            results[mode].append(res)
            if (idx + 1) % 25 == 0 or idx == len(scenarios) - 1:
                print(
                    f"  [{mode}] Completed {idx + 1}/{len(scenarios)} scenarios...",
                    flush=True,
                )

    # Compute summary aggregates per baseline mode
    summaries = {}
    for mode, mode_res in results.items():
        n = max(1, len(mode_res))
        summaries[mode] = {
            "total_scenarios": len(mode_res),
            "mean_tier_1_recall": round(
                sum(r["tier_1_recall"] for r in mode_res) / n, 4
            ),
            "mean_user_mandatory_satisfaction": round(
                sum(r["user_mandatory_satisfaction"] for r in mode_res) / n, 4
            ),
            "total_closure_violations": sum(r["closure_violations"] for r in mode_res),
            "total_node_cap_violations": sum(
                r["node_cap_violations"] for r in mode_res
            ),
            "mean_zigzag_ratio": round(sum(r["zigzag_ratio"] for r in mode_res) / n, 3),
            "mean_travel_minutes_per_day": round(
                sum(r["travel_minutes_per_day"] for r in mode_res) / n, 1
            ),
            "mean_load_variance": round(
                sum(r["load_variance"] for r in mode_res) / n, 1
            ),
            "mean_category_entropy": round(
                sum(r["category_entropy"] for r in mode_res) / n, 3
            ),
            "total_budget_overruns": sum(
                1 for r in mode_res if r["budget_overrun"] > 0
            ),
            "total_meal_spacing_violations": sum(
                r["meal_spacing_violations"] for r in mode_res
            ),
            "total_idle_time_violations": sum(
                r["idle_time_violations"] for r in mode_res
            ),
            "latency_p50_ms": round(
                float(sorted([r["latency_ms"] for r in mode_res])[n // 2]), 1
            ),
            "latency_p95_ms": round(
                float(sorted([r["latency_ms"] for r in mode_res])[int(n * 0.95) - 1]),
                1,
            ),
        }

    return {
        "results": results,
        "summaries": summaries,
    }
