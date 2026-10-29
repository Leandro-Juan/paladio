"""Global Transit Coverage Report CLI.

Fulfills PLAN.md Phase 0 & Step 11:
- Runs dynamic GTFS resolution across the city universe or test cohort
- Determines honest terminal tier (T0-T5) and explicit reason code
- Upserts rows to transit_coverage table
- Exports coverage_report.csv and prints tier histogram & country summary
- Guarantees ZERO exceptions and ZERO mocked/fabricated schedules.
"""

from __future__ import annotations

import argparse
import asyncio
import csv
import logging
import sys
import time
from collections import Counter
from dataclasses import dataclass

from sqlalchemy.dialects.postgresql import insert as pg_insert

from app.db.models import TransitCoverageModel
from app.db.session import async_session
from app.domain.city_key import (
    _get_geonamescache,
    generate_city_key,
    resolve_city_identity,
)
from app.services.gtfs_resolver_service import GTFSResolverService

logging.basicConfig(level=logging.INFO, format="%(levelname)s: %(message)s")
logger = logging.getLogger(__name__)

# Test Cohort specified in PLAN.md Section 7.1
TEST_COHORT: list[tuple[str, str | None, str]] = [
    # Rich GTFS, large
    ("Tokyo", "JP", "Rich GTFS, large"),
    ("Paris", "FR", "Rich GTFS, large"),
    ("London", "GB", "Rich GTFS, large"),
    ("New York", "US", "Rich GTFS, large"),
    ("Seoul", "KR", "Rich GTFS, large"),
    ("Madrid", "ES", "Rich GTFS, large"),
    ("Barcelona", "ES", "Rich GTFS, large"),
    ("Berlin", "DE", "Rich GTFS, large"),
    ("Sydney", "AU", "Rich GTFS, large"),
    ("Toronto", "CA", "Rich GTFS, large"),
    # Multi-operator
    ("Chicago", "US", "Multi-operator"),
    ("Zurich", "CH", "Multi-operator"),
    ("Amsterdam", "NL", "Multi-operator"),
    ("Hong Kong", "HK", "Multi-operator"),
    # Non-Latin names
    ("東京", "JP", "Non-Latin"),
    ("Москва", "RU", "Non-Latin"),
    ("서울", "KR", "Non-Latin"),
    ("القاهرة", "EG", "Non-Latin"),
    ("กรุงเทพมหานคร", "TH", "Non-Latin"),
    ("Αθήνα", "GR", "Non-Latin"),
    ("თბილისი", "GE", "Non-Latin"),
    ("תל אביב", "IL", "Non-Latin"),
    ("मुंबई", "IN", "Non-Latin"),
    # Diacritics and name collisions
    ("São Paulo", "BR", "Diacritics & Collision"),
    ("Zürich", "CH", "Diacritics & Collision"),
    ("Córdoba", "AR", "Diacritics & Collision"),
    ("Córdoba", "ES", "Diacritics & Collision"),
    ("Birmingham", "GB", "Diacritics & Collision"),
    ("Birmingham", "US", "Diacritics & Collision"),
    ("Valencia", "ES", "Diacritics & Collision"),
    ("Valencia", "VE", "Diacritics & Collision"),
    ("Santiago", "CL", "Diacritics & Collision"),
    ("Santiago", "ES", "Diacritics & Collision"),
    # Edge geography
    ("Suva", "FJ", "Edge geography"),
    ("Anadyr", "RU", "Edge geography"),
    ("Reykjavik", "IS", "Edge geography"),
    ("Longyearbyen", "SJ", "Edge geography"),
    ("Honolulu", "US", "Edge geography"),
    ("Singapore", "SG", "Edge geography"),
    ("Monaco", "MC", "Edge geography"),
    ("Istanbul", "TR", "Edge geography"),
    # Thin / informal or no open data
    ("Nairobi", "KE", "Informal/Thin"),
    ("Lagos", "NG", "Informal/Thin"),
    ("Havana", "CU", "No open data"),
    ("Ulaanbaatar", "MN", "No open data"),
]


@dataclass
class CityCoverageResult:
    city_key: str
    city_name: str
    country_code: str
    tier: str
    reason_code: str
    feed_ids: list[str]
    stage_reached: str
    population: int = 0
    note: str = ""


async def evaluate_city(
    name: str,
    country_code: str | None = None,
    note: str = "",
    population: int = 0,
) -> CityCoverageResult:
    """Evaluates a single city through the resolver pipeline and determines honest terminal tier."""
    norm_name, resolved_cc, geonames_id = resolve_city_identity(
        name, country_code=country_code
    )
    cc = country_code or resolved_cc
    city_key = generate_city_key(norm_name or name, cc, geonames_id)

    try:
        feeds = await GTFSResolverService.resolve_gtfs_feeds(name, country_code=cc)
        if feeds:
            # Check feed attributes
            feed_ids = [f.feed_id for f in feeds]
            has_auth = any(f.requires_auth for f in feeds)
            has_blocked_lic = any(f.licence == "blocked" for f in feeds)

            if has_blocked_lic:
                tier = "T5"
                reason = "LICENCE_BLOCKED"
                stage = "RESOLVED"
            elif has_auth:
                tier = "T5"
                reason = "AUTH_REQUIRED"
                stage = "RESOLVED"
            else:
                # Active open GTFS feed found
                tier = "T0"
                reason = "OPEN_SCHEDULE"
                stage = "RESOLVED"

            return CityCoverageResult(
                city_key=city_key,
                city_name=norm_name or name,
                country_code=cc,
                tier=tier,
                reason_code=reason,
                feed_ids=feed_ids,
                stage_reached=stage,
                population=population,
                note=note,
            )
        else:
            # Honest fallback tier: NO_FEED
            return CityCoverageResult(
                city_key=city_key,
                city_name=norm_name or name,
                country_code=cc,
                tier="T5",
                reason_code="NO_FEED",
                feed_ids=[],
                stage_reached="RESOLVED",
                population=population,
                note=note,
            )
    except Exception as exc:
        logger.error(f"Error evaluating city {name} ({cc}): {exc}")
        return CityCoverageResult(
            city_key=city_key,
            city_name=name,
            country_code=cc,
            tier="T5",
            reason_code=f"ERROR: {type(exc).__name__}",
            feed_ids=[],
            stage_reached="FAILED",
            population=population,
            note=note,
        )


async def persist_coverage_results(results: list[CityCoverageResult]) -> None:
    """Upserts results into the transit_coverage database table."""
    try:
        async with async_session() as session:
            for r in results:
                stmt = pg_insert(TransitCoverageModel).values(
                    city_key=r.city_key,
                    city_name=r.city_name,
                    country_code=r.country_code,
                    tier=r.tier,
                    reason_code=r.reason_code,
                    feed_ids=r.feed_ids,
                    stage_reached=r.stage_reached,
                    quality={"note": r.note},
                    population=r.population,
                )
                upsert_stmt = stmt.on_conflict_do_update(
                    index_elements=["city_key"],
                    set_={
                        "tier": stmt.excluded.tier,
                        "reason_code": stmt.excluded.reason_code,
                        "feed_ids": stmt.excluded.feed_ids,
                        "stage_reached": stmt.excluded.stage_reached,
                        "quality": stmt.excluded.quality,
                        "population": stmt.excluded.population,
                    },
                )
                await session.execute(upsert_stmt)
            await session.commit()
            logger.info(f"Persisted {len(results)} coverage records to database.")
    except Exception as exc:
        logger.warning(
            f"Could not persist coverage records to DB (check connection): {exc}"
        )


def export_csv(
    results: list[CityCoverageResult], output_path: str = "coverage_report.csv"
) -> None:
    """Writes results to CSV."""
    with open(output_path, "w", encoding="utf-8", newline="") as f:
        writer = csv.writer(f)
        writer.writerow(
            [
                "city_key",
                "city_name",
                "country_code",
                "tier",
                "reason_code",
                "feed_count",
                "feed_ids",
                "stage_reached",
                "population",
                "note",
            ]
        )
        for r in results:
            writer.writerow(
                [
                    r.city_key,
                    r.city_name,
                    r.country_code,
                    r.tier,
                    r.reason_code,
                    len(r.feed_ids),
                    ";".join(r.feed_ids),
                    r.stage_reached,
                    r.population,
                    r.note,
                ]
            )
    logger.info(f"Wrote {len(results)} rows to {output_path}")


def print_summary(results: list[CityCoverageResult], duration: float) -> None:
    """Prints terminal summary table with tier distribution, reasons, and country coverage."""
    tier_counts = Counter(r.tier for r in results)
    reason_counts = Counter(r.reason_code for r in results)
    country_counts = Counter(r.country_code for r in results)

    print("\n" + "=" * 70)
    print("GLOBAL TRANSIT COVERAGE REPORT SUMMARY")
    print("=" * 70)
    print(f"Total Cities Evaluated: {len(results)} (in {duration:.2f}s)")
    print(
        f"Exceptions / Crashes:   {sum(1 for r in results if 'ERROR' in r.reason_code)}"
    )
    print("-" * 70)
    print("TIER DISTRIBUTION:")
    for tier in sorted(tier_counts.keys()):
        cnt = tier_counts[tier]
        pct = (cnt / len(results)) * 100
        print(f"  {tier:4s}: {cnt:5d} ({pct:5.1f}%)")
    print("-" * 70)
    print("REASON CODE BREAKDOWN:")
    for reason, cnt in reason_counts.most_common():
        pct = (cnt / len(results)) * 100
        print(f"  {reason:24s}: {cnt:5d} ({pct:5.1f}%)")
    print("-" * 70)
    print(f"Countries Covered: {len(country_counts)}")
    print("=" * 70 + "\n")


async def main():
    parser = argparse.ArgumentParser(
        description="Global Transit Ingestion Coverage Report"
    )
    parser.add_argument(
        "--test-cohort", action="store_true", help="Run over Section 7.1 test cohort"
    )
    parser.add_argument(
        "--limit",
        type=int,
        default=0,
        help="Limit number of universe cities to evaluate",
    )
    parser.add_argument(
        "--csv", type=str, default="coverage_report.csv", help="Output CSV path"
    )
    args = parser.parse_args()

    await GTFSResolverService.ensure_catalog_loaded()

    t0 = time.time()
    results: list[CityCoverageResult] = []

    if args.test_cohort or (not args.test_cohort and args.limit == 0):
        # Run test cohort
        logger.info(f"Running evaluation over {len(TEST_COHORT)} test cohort cities...")
        for name, cc, note in TEST_COHORT:
            res = await evaluate_city(name, country_code=cc, note=note)
            results.append(res)
    else:
        # Run over GeoNames cities
        gc = _get_geonamescache()
        if not gc:
            logger.error("geonamescache not available for universe run.")
            sys.exit(1)
        cities = list(gc.get_cities().values())
        cities.sort(key=lambda c: c.get("population", 0), reverse=True)
        target_cities = cities[: args.limit] if args.limit > 0 else cities
        logger.info(f"Evaluating {len(target_cities)} cities from GeoNames universe...")

        # Process with controlled concurrency
        sem = asyncio.Semaphore(20)

        async def _eval(city_entry):
            async with sem:
                return await evaluate_city(
                    name=city_entry["name"],
                    country_code=city_entry.get("countrycode"),
                    population=city_entry.get("population", 0),
                )

        tasks = [_eval(c) for c in target_cities]
        results = await asyncio.gather(*tasks)

    duration = time.time() - t0
    export_csv(results, args.csv)
    await persist_coverage_results(results)
    print_summary(results, duration)


if __name__ == "__main__":
    asyncio.run(main())
