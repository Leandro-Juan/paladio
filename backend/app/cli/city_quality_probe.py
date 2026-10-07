"""Live multi-city quality probe for Itinerary v2.

Runs the real pipeline (real DB, real on-demand OSM ingestion) for many cities and
trip plans, then applies agency-realism checks to every generated itinerary.

Usage:
    python -m app.cli.city_quality_probe --cities "Rome,Bruges" --plans leisure_couple,week \
        --report /tmp/probe.md
"""

import argparse
import asyncio
import logging
import math
import time
from dataclasses import dataclass, field
from datetime import date, timedelta
from pathlib import Path
from typing import Any

from app.adapters.repositories.sql_poi_repository import SqlPoiRepository
from app.bench.runner import _fast_transit_matrix
from app.db.session import async_session
from app.engine.v2.city_readiness import ensure_city_ready
from app.engine.v2.pipeline import ItineraryV2Result, run_itinerary_v2_pipeline
from app.schemas.itinerary import (
    BookingAnchors,
    FlightSegment,
    NodeConstraint,
    TravelConstraints,
)
from app.schemas.user import PacePreference

logging.basicConfig(
    level=logging.WARNING, format="%(asctime)s [%(levelname)s] %(message)s"
)
logger = logging.getLogger("city_probe")

BASE_DATE = date(2026, 11, 3)  # a Tuesday


@dataclass
class Plan:
    name: str
    days: int
    pace: PacePreference
    budget_usd: float
    mandatory_terms: list[str] = field(default_factory=list)
    flights: bool = False


PLANS: dict[str, Plan] = {
    "leisure_couple": Plan("leisure_couple", 3, PacePreference.LEISURELY, 900),
    "balanced_family": Plan("balanced_family", 4, PacePreference.BALANCED, 1500),
    "intense_culture": Plan("intense_culture", 5, PacePreference.INTENSE, 1200),
    "weekend": Plan("weekend", 2, PacePreference.BALANCED, 500, flights=True),
    "backpacker": Plan("backpacker", 3, PacePreference.BALANCED, 250),
    "day_trip": Plan("day_trip", 1, PacePreference.INTENSE, 200),
    "week": Plan("week", 7, PacePreference.BALANCED, 2500),
}

# Expected non-meal stops per full day by pace (min, max)
PACE_RANGE = {
    PacePreference.LEISURELY: (2, 4),
    PacePreference.BALANCED: (3, 5),
    PacePreference.INTENSE: (4, 7),
}


def _hhmm(s: str) -> int:
    t = s.split("T")[-1][:5]
    h, m = t.split(":")
    return int(h) * 60 + int(m)


def _km(a: tuple[float, float], b: tuple[float, float]) -> float:
    r = 6371.0
    p1, p2 = math.radians(a[0]), math.radians(b[0])
    dl = math.radians(b[1] - a[1])
    h = (
        math.sin((p2 - p1) / 2) ** 2
        + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    )
    return 2 * r * math.asin(math.sqrt(h))


def _is_meal(p: Any) -> bool:
    return p.poi.category.upper() in ("RESTAURANT", "CAFE")


def _is_depot(p: Any) -> bool:
    return p.poi.category.upper() in ("HOTEL", "AIRPORT")


def build_constraints(city: str, plan: Plan, mandatory: list[str]) -> TravelConstraints:
    start = BASE_DATE
    end = BASE_DATE + timedelta(days=plan.days - 1)
    anchors = None
    if plan.flights:
        anchors = BookingAnchors(
            outbound_flight=FlightSegment(
                origin_iata="XXX",
                destination_iata="YYY",
                departure_time=f"{start}T08:00:00",
                arrival_time=f"{start}T12:30:00",
            ),
            return_flight=FlightSegment(
                origin_iata="YYY",
                destination_iata="XXX",
                departure_time=f"{end}T19:00:00",
            ),
        )
    return TravelConstraints(
        destination_city=city,
        budget_usd=plan.budget_usd,
        pace=plan.pace,
        start_date=start,
        end_date=end,
        nodes=[NodeConstraint(poi_id=m, mandatory=True) for m in mandatory],
        booking_anchors=anchors,
    )


def evaluate(
    result: ItineraryV2Result,
    plan: Plan,
    t1_available: int,
    total_available: int = 100,
    radius_km: float = 4.0,
) -> tuple[list[str], dict[str, Any]]:
    """Returns (issues, stats). Empty issues == agency-grade."""
    issues: list[str] = []
    n_days = len(result.days)
    lo, hi = PACE_RANGE[plan.pace]
    effective_lo = (
        min(lo, max(1, total_available // n_days))
        if total_available < n_days * lo
        else lo
    )
    t1_visited: set[str] = set()
    visited: list[str] = []
    total_sights = 0
    max_span = 0.0
    zig_max = 0.0
    travel_total = 0
    seen_ids: set[str] = set()

    for d in result.days:
        itin = d["itinerary"]
        path = [p for p in itin.path if not _is_depot(p)]
        sights = [p for p in path if not _is_meal(p)]
        meals = [p for p in path if _is_meal(p)]
        idx = d["day_index"]
        is_edge = idx in (0, n_days - 1) and n_days > 1
        total_sights += len(sights)
        visited += [p.poi.name for p in sights]

        if not sights:
            issues.append(f"day{idx + 1}: no sights scheduled")
            continue
        active_mins = sum(p.poi.duration_mins for p in sights)
        if (
            not is_edge
            and len(sights) < effective_lo
            and plan.pace != PacePreference.LEISURELY
            and active_mins < 150
        ):
            issues.append(f"day{idx + 1}: only {len(sights)} sights (<{effective_lo})")
        if len(sights) > hi:
            issues.append(f"day{idx + 1}: {len(sights)} sights (>{hi})")

        for p in sights:
            pid = p.poi.id or p.poi.name
            if pid in seen_ids:
                issues.append(f"duplicate stop: {p.poi.name}")
            seen_ids.add(pid)
            if getattr(p.poi, "tier", 0) == 1:
                t1_visited.add(p.poi.name)

        starts = [_hhmm(p.scheduled_start) for p in path]
        ends = [_hhmm(p.scheduled_end) for p in path]
        if starts and min(starts) < 8 * 60 + 30:
            issues.append(f"day{idx + 1}: starts before 08:30")
        if ends and max(ends) > 24 * 60:
            issues.append(f"day{idx + 1}: ends after 24:00")

        lunches = [
            m for m in meals if 11 * 60 + 30 <= _hhmm(m.scheduled_start) <= 15 * 60
        ]
        full_day = not is_edge and len(sights) >= 3
        if full_day and not lunches:
            issues.append(f"day{idx + 1}: no lunch between 11:30-15:00")
        if len(lunches) > 1:
            issues.append(f"day{idx + 1}: {len(lunches)} lunches")

        legs = [
            p.transit_from_previous.duration_mins
            for p in path
            if p.transit_from_previous
        ]
        travel = sum(legs)
        travel_total += travel
        if travel > 150:
            issues.append(f"day{idx + 1}: {travel} min travel (>150)")
        if legs and max(legs) > 50:
            issues.append(f"day{idx + 1}: leg of {max(legs)} min (>50)")

        coords = [(p.poi.location.latitude, p.poi.location.longitude) for p in sights]
        for i in range(len(coords)):
            for j in range(i + 1, len(coords)):
                max_span = max(max_span, _km(coords[i], coords[j]))
        allowed_span = max(9.0, min(15.0, radius_km * 1.5))
        if len(coords) >= 2:
            span = max(
                _km(coords[i], coords[j])
                for i in range(len(coords))
                for j in range(i + 1, len(coords))
            )
            if span > allowed_span:
                issues.append(
                    f"day{idx + 1}: sights spread {span:.1f} km apart (>{allowed_span:.1f}km)"
                )

        # idle gaps
        timeline = sorted(zip(starts, ends))
        for (_, e1), (s2, _) in zip(timeline, timeline[1:]):
            if s2 - e1 > 115:
                issues.append(f"day{idx + 1}: {s2 - e1} min idle gap")
                break

    if len(set(visited)) < len(visited):
        issues.append("same sight visited more than once")
    if t1_available:
        wanted = min(t1_available, max(2, round(0.5 * total_sights)))
        covered = len(t1_visited)
        if covered < min(wanted, 2 + n_days // 2):
            issues.append(
                f"must-see coverage low: {covered}/{t1_available} Tier-1 visited"
            )
    budget_eur = plan.budget_usd * 0.92
    if budget_eur and result.summary.total_cost_eur > budget_eur * 1.02:
        issues.append(
            f"over budget: {result.summary.total_cost_eur:.0f} > {budget_eur:.0f} EUR"
        )
    stats = {
        "sights": total_sights,
        "t1_visited": len(t1_visited),
        "t1_available": t1_available,
        "travel_per_day": round(travel_total / max(1, n_days), 1),
        "max_span_km": round(max_span, 1),
        "cost_eur": result.summary.total_cost_eur,
        "zig": round(zig_max, 2),
    }
    return issues, stats


def render(result: ItineraryV2Result) -> list[str]:
    lines: list[str] = []
    for d in result.days:
        lines.append(
            f"- **Day {d['day_index'] + 1}** — {d['theme']} (anchor: {d['anchor']})"
        )
        for p in d["itinerary"].path:
            if _is_depot(p):
                continue
            tag = "🍽" if _is_meal(p) else "•"
            tr = (
                f" ← {p.transit_from_previous.duration_mins}m"
                if p.transit_from_previous
                else ""
            )
            lines.append(
                f"    - {tag} {p.scheduled_start[-8:-3]}–{p.scheduled_end[-8:-3]} "
                f"{p.poi.name} [T{p.poi.tier}]{tr}"
            )
    return lines


async def probe(
    cities: list[str],
    plan_names: list[str],
    report: Path,
    mandatory: dict[str, list[str]],
) -> int:
    out: list[str] = ["# Itinerary v2 live multi-city probe\n"]
    summary_rows: list[str] = []
    failures = 0
    runs = 0
    for city in cities:
        async with async_session() as session:
            repo = SqlPoiRepository(session)
            t0 = time.perf_counter()
            try:
                ready = await ensure_city_ready(city, repo)
            except Exception as exc:  # report loudly, continue with other cities
                out.append(f"## {city}\n\n**INGEST FAILED**: {exc}\n")
                summary_rows.append(f"| {city} | - | INGEST FAILED | {exc} |")
                failures += 1
                continue
            ingest_s = time.perf_counter() - t0
            out.append(
                f"## {city} — T1={ready.tier1} T2={ready.tier2} dining={ready.dining} "
                f"(ingested={ready.ingested}, {ingest_s:.1f}s)\n"
            )
            for pname in plan_names:
                plan = PLANS[pname]
                runs += 1
                constraints = build_constraints(
                    city,
                    plan,
                    mandatory.get(city.lower(), [])
                    if pname == "intense_culture"
                    else [],
                )
                t1 = time.perf_counter()
                try:
                    res = await run_itinerary_v2_pipeline(
                        city=ready.city,
                        constraints=constraints,
                        poi_repo=repo,
                        transit_matrix_fn=_fast_transit_matrix,
                    )
                except Exception as exc:
                    out.append(
                        f"### {pname}\n**PIPELINE FAILED**: {type(exc).__name__}: {exc}\n"
                    )
                    summary_rows.append(
                        f"| {city} | {pname} | PIPELINE FAILED | {exc} |"
                    )
                    failures += 1
                    continue
                ms = (time.perf_counter() - t1) * 1000
                if ready.geo:
                    radius = ready.geo.radius_km
                else:
                    city_pois = await repo.find_by_city(ready.city)
                    coords = [
                        (p.location.latitude, p.location.longitude)
                        for p in city_pois
                        if p.location and p.location.latitude and p.location.longitude
                    ]
                    if coords:
                        mid_lat = sum(c[0] for c in coords) / len(coords)
                        mid_lon = sum(c[1] for c in coords) / len(coords)
                        radius = max(_km((mid_lat, mid_lon), c) for c in coords)
                    else:
                        radius = 4.0
                issues, stats = evaluate(
                    res,
                    plan,
                    ready.tier1,
                    total_available=ready.tier1 + ready.tier2,
                    radius_km=radius,
                )
                verdict = "PASS" if not issues else f"{len(issues)} issue(s)"
                if issues:
                    failures += 1
                summary_rows.append(
                    f"| {city} | {pname} | {verdict} | sights={stats['sights']} "
                    f"T1={stats['t1_visited']}/{stats['t1_available']} "
                    f"travel/day={stats['travel_per_day']}m cost={stats['cost_eur']:.0f}€ {ms:.0f}ms |"
                )
                out.append(f"### {pname} — {verdict}\n")
                out += [f"- ⚠ {i}" for i in issues]
                out += render(res)
                out.append("")
    header = [
        "| City | Plan | Verdict | Stats |",
        "|---|---|---|---|",
    ]
    report.parent.mkdir(parents=True, exist_ok=True)
    report.write_text(
        "\n".join(out[:1] + header + summary_rows + [""] + out[1:]), encoding="utf-8"
    )
    print(f"{runs} runs, {failures} with issues/failures. Report: {report}")
    return 0 if failures == 0 else 1


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--cities", required=True)
    ap.add_argument("--plans", default=",".join(PLANS))
    ap.add_argument("--report", default="/tmp/city_probe.md")
    args = ap.parse_args()
    cities = [c.strip() for c in args.cities.split(",") if c.strip()]
    plans = [p.strip() for p in args.plans.split(",") if p.strip()]
    return asyncio.run(probe(cities, plans, Path(args.report), {}))


if __name__ == "__main__":
    raise SystemExit(main())
