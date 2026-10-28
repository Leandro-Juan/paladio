import argparse
import asyncio
import logging
import os
import sys

from app.db.session import async_session
from app.services.transit_derivation_service import TransitDerivationService

logging.basicConfig(
    level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s"
)
logger = logging.getLogger(__name__)


async def run_derive_transit(city: str) -> None:
    city_lower = city.strip().lower()
    gtfs_base = os.getenv("GTFS_BASE_DIR", "/gtfs_feeds")
    city_dir = os.path.join(gtfs_base, city_lower)

    if not os.path.isdir(city_dir):
        logger.error(f"GTFS directory does not exist: {city_dir}")
        sys.exit(1)

    logger.info(
        f"Starting transit derivation for city '{city_lower}' from {city_dir}..."
    )
    async with async_session() as session:
        service = TransitDerivationService(session, gtfs_base_dir=gtfs_base)
        try:
            result = await service.derive_city(city_lower)
            logger.info(
                f"Successfully derived transit for '{city_lower}': "
                f"Build ID = {result['build_id']}, "
                f"Stations = {result['stations_count']}, "
                f"Lines = {result['lines_count']}"
            )
            logger.info(f"Capabilities: {result['capabilities']}")
            logger.info(f"Quality Report: {result['quality']}")
        except Exception as e:
            logger.exception(f"Derivation failed for '{city_lower}': {e}")
            sys.exit(1)


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Backfill compact derived transit tables from a pruned GTFS feed."
    )
    parser.add_argument(
        "--city",
        required=True,
        help="Target city name (e.g. tokyo, paris)",
    )
    args = parser.parse_args()
    asyncio.run(run_derive_transit(args.city))


if __name__ == "__main__":
    main()
