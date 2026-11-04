import asyncio
import logging
import os
import sys

# Ensure backend root is on PYTHONPATH
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from sqlalchemy import select
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker, AsyncSession

from app.db.models import TripModel
from app.domain.schemas.itinerary_document import ItineraryDocument

logging.basicConfig(
    level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s"
)
logger = logging.getLogger("verify_itineraries")

DATABASE_URL = os.getenv(
    "DATABASE_URL",
    "postgresql+asyncpg://postgres:postgres@127.0.0.1:5432/paladio",
)


async def main():
    logger.info(f"Connecting to database: {DATABASE_URL.split('@')[-1]}")
    engine = create_async_engine(DATABASE_URL, echo=False)
    session_maker = async_sessionmaker(
        engine, class_=AsyncSession, expire_on_commit=False
    )

    total_trips = 0
    passed_trips = 0
    failed_trips = 0
    backfilled_trips = 0
    total_stops = 0
    backfilled_stops = 0

    async with session_maker() as session:
        stmt = select(TripModel)
        result = await session.execute(stmt)
        trips = result.scalars().all()
        total_trips = len(trips)
        logger.info(f"Loaded {total_trips} trips from database.")

        for trip in trips:
            raw_data = trip.itinerary_data
            if not raw_data:
                logger.warning(f"Trip {trip.id} has empty itinerary_data.")
                passed_trips += 1
                continue

            try:
                # Count stops before backfill
                days_raw = raw_data.get("days") if isinstance(raw_data, dict) else []
                days = days_raw if isinstance(days_raw, list) else []
                trip_stops = 0
                missing_stop_ids = 0
                for d in days:
                    if isinstance(d, dict):
                        itin = d.get("itinerary", {})
                        if isinstance(itin, dict):
                            for s in itin.get("path", []):
                                if isinstance(s, dict):
                                    trip_stops += 1
                                    if not s.get("stop_id"):
                                        missing_stop_ids += 1

                total_stops += trip_stops

                doc, modified = ItineraryDocument.from_dict(raw_data)
                passed_trips += 1

                if modified:
                    backfilled_trips += 1
                    backfilled_stops += missing_stop_ids
                    # Update database with normalized itinerary_data
                    updated_dict = doc.to_dict()
                    trip.itinerary_data = updated_dict
                    session.add(trip)
                    logger.info(
                        f"Backfilled {missing_stop_ids} stop_ids for trip '{trip.id}' ({trip.destination})"
                    )

            except Exception as e:
                failed_trips += 1
                logger.error(
                    f"Failed to parse trip '{trip.id}' ({trip.destination}): {e}"
                )

        if backfilled_trips > 0:
            await session.commit()
            logger.info(
                f"Successfully committed backfills for {backfilled_trips} trips."
            )

    await engine.dispose()

    logger.info("=== ITINERARY VERIFICATION & BACKFILL REPORT ===")
    logger.info(f"Total Trips Processed: {total_trips}")
    logger.info(f"Successfully Parsed:   {passed_trips}")
    logger.info(f"Failed to Parse:       {failed_trips}")
    logger.info(f"Total Stops:           {total_stops}")
    logger.info(f"Backfilled Stops:      {backfilled_stops}")
    logger.info(f"Backfilled Trips:      {backfilled_trips}")
    logger.info("================================================")

    if failed_trips > 0:
        sys.exit(1)


if __name__ == "__main__":
    asyncio.run(main())
