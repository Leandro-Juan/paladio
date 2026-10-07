"""Quality scorer and realism metrics for Paladio itineraries.

Implements Section 1 operational gates (day span, spatial compactness,
meal realism, and non-synthetic honesty) across any saved trip JSON or ItineraryResult.
"""

from __future__ import annotations

import json
import sys
from dataclasses import dataclass, field
from typing import Any

from app.bench.metrics import calculate_zigzag_ratio
from app.engine.transit_matrix import haversine_distance


def _has_data_provenance(poi: dict[str, Any]) -> bool:
    """Verifies that a venue originates from real data rather than being synthetic.

    A venue is considered synthetic/unverified if:
    - It has no persistent ID (id is None or empty).
    - Its cost_source is explicitly flagged as synthetic/mock/placeholder.
    - Its ID is a synthetic depot identifier.
    """
    poi_id = poi.get("id")
    if not poi_id:
        return False
    str_id = str(poi_id).lower()
    if str_id.startswith("default_") or str_id in ("synthetic", "placeholder", "mock"):
        return False
    source = str(poi.get("cost_source") or "").lower()
    if any(
        k in source for k in ("synthetic", "mock", "placeholder", "fallback_generated")
    ):
        return False
    return True


def _time_str_to_mins(t_str: str | None) -> int | None:
    if not t_str or ":" not in t_str:
        return None
    try:
        parts = t_str.strip().split(":")
        return int(parts[0]) * 60 + int(parts[1])
    except (ValueError, IndexError):
        return None


def _mins_to_time_str(mins: int | None) -> str:
    if mins is None:
        return "--:--"
    h = mins // 60
    m = mins % 60
    return f"{h:02d}:{m:02d}"


@dataclass
class DayQualityMetrics:
    day_index: int
    is_arrival_day: bool
    is_departure_day: bool
    sights_count: int
    meals_count: int
    first_activity_start: str | None
    last_visit_end: str | None
    active_span_mins: int
    ends_before_dinner: bool
    walk_km: float
    bounding_diameter_km: float
    zigzag_ratio: float
    meal_spacing_violations: int
    synthetic_meals_count: int
    has_lunch: bool
    has_dinner: bool
    violations: list[str] = field(default_factory=list)


@dataclass
class ItineraryQualityReport:
    destination: str
    trip_id: str | None
    total_days: int
    days: list[DayQualityMetrics]
    mean_zigzag_ratio: float
    max_bounding_diameter_km: float
    early_ending_days_count: int
    total_synthetic_meals: int
    total_meal_spacing_violations: int
    overall_realism_score: float  # Scale 0.0 to 10.0
    gates_passed: bool
    gate_failures: list[str] = field(default_factory=list)


def evaluate_day_quality(
    day_data: dict[str, Any],
    is_arrival: bool = False,
    is_departure: bool = False,
) -> DayQualityMetrics:
    itin = day_data.get("itinerary", {})
    if hasattr(itin, "model_dump"):
        itin = itin.model_dump(mode="json")
    elif not isinstance(itin, dict):
        itin = {}
    path = itin.get("path", [])

    day_idx = day_data.get("day") or day_data.get("day_index") or 1

    non_depots: list[dict[str, Any]] = []
    coords: list[tuple[float, float]] = []

    for item in path:
        poi = item.get("poi", {})
        cat = (poi.get("category") or "").upper()
        loc = poi.get("location") or {}
        lat = loc.get("latitude")
        lon = loc.get("longitude")
        if lat is not None and lon is not None:
            coords.append((lat, lon))

        if cat not in ("HOTEL", "AIRPORT"):
            non_depots.append(item)

    sights: list[dict[str, Any]] = []
    meals: list[dict[str, Any]] = []

    for item in non_depots:
        poi = item.get("poi", {})
        cat = (poi.get("category") or "").upper()
        if cat in ("RESTAURANT", "CAFE", "BAKERY", "BAR"):
            meals.append(item)
        else:
            sights.append(item)

    # First and last visit times
    first_start_mins = None
    last_end_mins = None

    for item in non_depots:
        s_mins = _time_str_to_mins(item.get("scheduled_start"))
        e_mins = _time_str_to_mins(item.get("scheduled_end"))
        if s_mins is not None:
            first_start_mins = (
                s_mins if first_start_mins is None else min(first_start_mins, s_mins)
            )
        if e_mins is not None:
            last_end_mins = (
                e_mins if last_end_mins is None else max(last_end_mins, e_mins)
            )

    active_span_mins = (
        (last_end_mins - first_start_mins)
        if (last_end_mins and first_start_mins and last_end_mins >= first_start_mins)
        else 0
    )

    # Day span check: full days ending before 18:30 (1110 mins) violate gate
    ends_before_dinner = False
    violations: list[str] = []

    if not is_departure and not is_arrival:
        if last_end_mins is None or last_end_mins < 1110:
            ends_before_dinner = True
            violations.append(
                f"Day ended early at {_mins_to_time_str(last_end_mins)} (before 18:30 dinner start)"
            )
        if len(sights) < 2:
            violations.append(f"Starved day: only {len(sights)} sights scheduled")
        elif len(sights) > 7:
            violations.append(f"Overloaded day: {len(sights)} sights scheduled")

    # Spatial metrics
    walk_km = 0.0
    for i in range(len(coords) - 1):
        walk_km += haversine_distance(
            coords[i][0], coords[i][1], coords[i + 1][0], coords[i + 1][1]
        )

    bounding_diam_km = 0.0
    for i in range(len(coords)):
        for j in range(i + 1, len(coords)):
            d = haversine_distance(
                coords[i][0], coords[i][1], coords[j][0], coords[j][1]
            )
            bounding_diam_km = max(bounding_diam_km, d)

    zigzag = calculate_zigzag_ratio(coords) if len(coords) >= 3 else 1.0
    if zigzag > 1.35 and not (is_arrival or is_departure):
        violations.append(f"High ping-pong zigzag ratio: {zigzag:.2f} > 1.35")

    # Meal spacing & synthetic checks
    spacing_violations = 0
    synthetic_meals = 0
    has_lunch = False
    has_dinner = False

    meal_mins: list[int] = []
    for m in meals:
        poi = m.get("poi", {})
        if not _has_data_provenance(poi):
            synthetic_meals += 1
            violations.append(
                f"Unverified / synthetic meal venue without data provenance: '{poi.get('name')}'"
            )

        arr_m = _time_str_to_mins(m.get("scheduled_start"))
        if arr_m is not None:
            meal_mins.append(arr_m)
            # Lunch window: 11:30 - 16:00
            if 690 <= arr_m <= 960:
                has_lunch = True
            # Dinner window: 18:30 - 23:30
            if 1110 <= arr_m <= 1410:
                has_dinner = True

    meal_mins.sort()
    for i in range(len(meal_mins) - 1):
        if meal_mins[i + 1] - meal_mins[i] < 180:
            spacing_violations += 1
            violations.append(
                f"Meal spacing violation: only {meal_mins[i+1] - meal_mins[i]} mins between meals"
            )

    if not is_departure and not is_arrival:
        if not has_lunch and not has_dinner:
            violations.append("Zero lunch or dinner stops scheduled")
        elif not has_dinner:
            violations.append("Missing dinner stop on full day")

    return DayQualityMetrics(
        day_index=day_idx,
        is_arrival_day=is_arrival,
        is_departure_day=is_departure,
        sights_count=len(sights),
        meals_count=len(meals),
        first_activity_start=_mins_to_time_str(first_start_mins),
        last_visit_end=_mins_to_time_str(last_end_mins),
        active_span_mins=active_span_mins,
        ends_before_dinner=ends_before_dinner,
        walk_km=round(walk_km, 2),
        bounding_diameter_km=round(bounding_diam_km, 2),
        zigzag_ratio=round(zigzag, 2),
        meal_spacing_violations=spacing_violations,
        synthetic_meals_count=synthetic_meals,
        has_lunch=has_lunch,
        has_dinner=has_dinner,
        violations=violations,
    )


def evaluate_itinerary_quality(
    itinerary_payload: dict[str, Any],
) -> ItineraryQualityReport:
    dest = itinerary_payload.get("destination") or "Unknown"
    trip_id = itinerary_payload.get("id")

    itin_data = itinerary_payload.get("itinerary_data") or itinerary_payload
    days_data = itin_data.get("days", [])
    total_days = len(days_data)

    day_metrics: list[DayQualityMetrics] = []
    for idx, d in enumerate(days_data):
        is_arr = idx == 0
        is_dep = idx == (total_days - 1)
        m = evaluate_day_quality(d, is_arrival=is_arr, is_departure=is_dep)
        day_metrics.append(m)

    # Aggregates
    full_days = [
        m for m in day_metrics if not m.is_arrival_day and not m.is_departure_day
    ]
    mean_zigzag = (
        sum(m.zigzag_ratio for m in day_metrics) / len(day_metrics)
        if day_metrics
        else 1.0
    )
    max_diam = max((m.bounding_diameter_km for m in day_metrics), default=0.0)
    early_ending = sum(1 for m in full_days if m.ends_before_dinner)
    synthetic_meals = sum(m.synthetic_meals_count for m in day_metrics)
    spacing_violations = sum(m.meal_spacing_violations for m in day_metrics)

    # Score out of 10.0
    # Day span component (2.5 max): penalize early ending
    day_span_score = 2.5
    if full_days:
        day_span_score -= (early_ending / len(full_days)) * 2.5

    # Compactness / ping-pong component (2.5 max)
    compact_score = 2.5
    if mean_zigzag > 1.3:
        compact_score -= min(1.5, (mean_zigzag - 1.3) * 3.0)
    if max_diam > 6.0:
        compact_score -= min(1.0, (max_diam - 6.0) * 0.25)
    compact_score = max(0.0, compact_score)

    # Meal realism component (2.5 max)
    meal_score = 2.5
    if synthetic_meals > 0:
        meal_score -= 1.5
    if spacing_violations > 0:
        meal_score -= min(1.0, spacing_violations * 0.5)
    meal_score = max(0.0, meal_score)

    # Pacing / consistency component (2.5 max)
    pacing_score = 2.5
    for m in full_days:
        if m.sights_count < 2 or m.sights_count > 7:
            pacing_score -= 0.5
    pacing_score = max(0.0, pacing_score)

    overall_score = round(day_span_score + compact_score + meal_score + pacing_score, 1)

    gate_failures: list[str] = []
    if early_ending > 0:
        gate_failures.append(f"{early_ending} full days ended early (before dinner)")
    if synthetic_meals > 0:
        gate_failures.append(f"{synthetic_meals} synthetic/fabricated venues detected")
    if mean_zigzag > 1.35:
        gate_failures.append(f"Mean zigzag ratio {mean_zigzag:.2f} exceeds 1.35 limit")
    if spacing_violations > 0:
        gate_failures.append(f"{spacing_violations} meal spacing violations (<180m)")

    gates_passed = len(gate_failures) == 0 and overall_score >= 8.0

    return ItineraryQualityReport(
        destination=dest,
        trip_id=trip_id,
        total_days=total_days,
        days=day_metrics,
        mean_zigzag_ratio=round(mean_zigzag, 2),
        max_bounding_diameter_km=round(max_diam, 2),
        early_ending_days_count=early_ending,
        total_synthetic_meals=synthetic_meals,
        total_meal_spacing_violations=spacing_violations,
        overall_realism_score=overall_score,
        gates_passed=gates_passed,
        gate_failures=gate_failures,
    )


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python -m app.quality.itinerary_metrics <path_or_url>")
        sys.exit(1)

    target = sys.argv[1]
    if target.startswith(("http://", "https://")):
        import urllib.request

        with urllib.request.urlopen(target) as resp:
            data = json.loads(resp.read())
    else:
        with open(target, "r") as f:
            data = json.load(f)

    report = evaluate_itinerary_quality(data)
    print("=" * 60)
    print(f"ITINERARY QUALITY REPORT: {report.destination} (ID: {report.trip_id})")
    print(f"Overall Realism Score: {report.overall_realism_score} / 10.0")
    print(f"Quality Gates: {'PASSED' if report.gates_passed else 'FAILED'}")
    if report.gate_failures:
        print("Gate Failures:")
        for gf in report.gate_failures:
            print(f"  - [FAIL] {gf}")
    print("=" * 60)
    for d in report.days:
        status = (
            "ARR" if d.is_arrival_day else ("DEP" if d.is_departure_day else "FULL")
        )
        print(
            f"Day {d.day_index} ({status}): {d.sights_count} sights, {d.meals_count} meals | "
            f"Active: {d.first_activity_start} -> {d.last_visit_end} ({d.active_span_mins}m) | "
            f"Walk: {d.walk_km}km, Diam: {d.bounding_diameter_km}km, Zigzag: {d.zigzag_ratio}"
        )
        for v in d.violations:
            print(f"    * VIOLATION: {v}")
