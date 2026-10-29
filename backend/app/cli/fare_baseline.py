"""Baseline transit fare diagnostic and benchmarking CLI.

Scans a list of major and obscure cities, records which tier answers,
the currency returned, whether prices are found or honestly marked unknown,
and exports a baseline report.
"""

from __future__ import annotations

import asyncio
import json
import logging
import sys
from typing import Any

from app.db.session import async_session
from app.services.transit_fare_service import TransitFareService

logging.basicConfig(
    level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s"
)
logger = logging.getLogger(__name__)

DEFAULT_TEST_CITIES = [
    # Tier 1 Global Metropolises
    "tokyo",
    "paris",
    "madrid",
    "london",
    "new_york",
    "berlin",
    "barcelona",
    "rome",
    "amsterdam",
    "singapore",
    # Tier 2 Regional Hubs
    "seville",
    "kyoto",
    "osaka",
    "lyon",
    "valencia",
    "florence",
    # Tier 3 Smaller / Obscure Municipalities
    "toledo",
    "cuenca",
    "matsumoto",
    "takayama",
    "sintra",
    # Negative Control (Fictional / Unindexed)
    "atlantis_test_city",
]


async def run_baseline(cities: list[str] | None = None) -> list[dict[str, Any]]:
    cities_to_check = cities or DEFAULT_TEST_CITIES
    results: list[dict[str, Any]] = []

    print(f"\n{'='*70}")
    print(f"PALADIO REAL-FARE INGESTION BASELINE PROBE ({len(cities_to_check)} CITIES)")
    print(f"{'='*70}")
    print(
        f"{'CITY':<20} | {'TIER / SOURCE':<25} | {'CURR':<5} | {'FARE':<8} | {'UNKNOWN?'}"
    )
    print(f"{'-'*70}")

    async with async_session() as session:
        for city in cities_to_check:
            try:
                fare = await TransitFareService.resolve_city_transit_fare(
                    city, db=session
                )
                tier_label = fare.source or "unknown"
                curr = fare.currency or "N/A"
                price_str = (
                    f"{fare.single_fare:.2f}"
                    if (fare.single_fare is not None and not fare.fare_unknown)
                    else "N/A"
                )
                is_unknown = "YES" if fare.fare_unknown else "NO"

                entry = {
                    "city": city,
                    "source": fare.source,
                    "currency": fare.currency,
                    "single_fare": fare.single_fare,
                    "fare_unknown": fare.fare_unknown,
                    "is_estimated": fare.is_estimated,
                    "agency_name": fare.agency_name,
                    "source_url": fare.source_url,
                }
                results.append(entry)
                print(
                    f"{city:<20} | {tier_label[:25]:<25} | {curr:<5} | {price_str:<8} | {is_unknown}"
                )
            except Exception as e:
                logger.error(f"Error evaluating baseline for {city}: {e}")
                results.append(
                    {
                        "city": city,
                        "error": str(e),
                        "fare_unknown": True,
                    }
                )
                print(
                    f"{city:<20} | {'ERROR: ' + str(e)[:18]:<25} | {'ERR':<5} | {'ERR':<8} | YES"
                )

    print(f"{'='*70}\n")
    return results


def main() -> None:
    cities = sys.argv[1:] if len(sys.argv) > 1 else None
    results = asyncio.run(run_baseline(cities))
    with open("/tmp/fare_baseline_report.json", "w") as f:
        json.dump(results, f, indent=2)
    print("Baseline report saved to /tmp/fare_baseline_report.json")


if __name__ == "__main__":
    main()
