import asyncio
import logging

from app.db.session import async_session
from app.services.poi_pricing_service import PoiPricingService
from app.utils.opening_hours_parser import parse_osm_opening_hours
from sqlalchemy import text

logging.basicConfig(
    level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s"
)
logger = logging.getLogger(__name__)


async def run_migration():
    logger.info("Starting atomic database migration for attractions table...")

    async with async_session() as session, session.begin():
        # 1. Add new typed scalar and vector columns if not exist
        logger.info("Step 1: Adding new typed columns to 'attractions'...")
        await session.execute(
            text(
                """
                    ALTER TABLE attractions
                    ADD COLUMN IF NOT EXISTS open_time_mins_by_day INTEGER[] DEFAULT '{480,480,480,480,480,480,480}',
                    ADD COLUMN IF NOT EXISTS close_time_mins_by_day INTEGER[] DEFAULT '{1320,1320,1320,1320,1320,1320,1320}',
                    ADD COLUMN IF NOT EXISTS duration_mins INTEGER DEFAULT 60,
                    ADD COLUMN IF NOT EXISTS cost_eur FLOAT DEFAULT 0.0,
                    ADD COLUMN IF NOT EXISTS cost_is_estimated BOOLEAN DEFAULT TRUE,
                    ADD COLUMN IF NOT EXISTS cost_source VARCHAR,
                    ADD COLUMN IF NOT EXISTS osm_opening_hours VARCHAR;
                    """
            )
        )

        # 2. Check if legacy schedule/financials columns still exist to migrate
        col_check = await session.execute(
            text(
                """
                    SELECT column_name
                    FROM information_schema.columns
                    WHERE table_name = 'attractions' AND column_name IN ('schedule', 'financials');
                    """
            )
        )
        existing_legacy_cols = [r[0] for r in col_check.fetchall()]

        if "schedule" in existing_legacy_cols and "financials" in existing_legacy_cols:
            # 3. Query existing rows to migrate
            logger.info("Step 2: Fetching existing attractions for data migration...")
            result = await session.execute(
                text(
                    "SELECT id, city, name, category, schedule, financials FROM attractions;"
                )
            )
            rows = result.fetchall()
            total_rows = len(rows)
            logger.info(f"Found {total_rows} attractions to migrate.")

            for row in rows:
                r_id, r_city, r_name, r_cat, sched, fin = row

                # Parse schedule
                osm_h = None
                dur = 60
                if isinstance(sched, dict):
                    osm_h = sched.get("osm_opening_hours")
                    raw_dur = sched.get("recommended_duration_minutes")
                    if raw_dur and int(raw_dur) > 0:
                        dur = int(raw_dur)

                parsed_hours = parse_osm_opening_hours(osm_h)
                open_vec = parsed_hours.open_time_mins_by_day
                close_vec = parsed_hours.close_time_mins_by_day

                # Parse financials and resolve real pricing
                raw_cost = 0.0
                raw_is_est = True
                raw_src = None
                if isinstance(fin, dict):
                    raw_cost = fin.get("estimated_cost") or fin.get("price") or 0.0
                    raw_is_est = fin.get("is_estimated", True)
                    raw_src = fin.get("price_source")

                cost, is_est, src = PoiPricingService.resolve_poi_price(
                    poi_name=r_name,
                    city=r_city or "",
                    category=r_cat,
                    existing_cost=float(raw_cost),
                    existing_is_estimated=bool(raw_is_est),
                    existing_source=raw_src,
                )

                await session.execute(
                    text(
                        """
                            UPDATE attractions
                            SET open_time_mins_by_day = :open_vec,
                                close_time_mins_by_day = :close_vec,
                                duration_mins = :dur,
                                cost_eur = :cost,
                                cost_is_estimated = :is_est,
                                cost_source = :src,
                                osm_opening_hours = :osm_h
                            WHERE id = :id;
                            """
                    ),
                    {
                        "id": r_id,
                        "open_vec": open_vec,
                        "close_vec": close_vec,
                        "dur": dur,
                        "cost": cost,
                        "is_est": is_est,
                        "src": src,
                        "osm_h": osm_h,
                    },
                )

            # 4. Pre-Drop Validation Gate (Guardrail 2)
            logger.info("Step 3: Running Pre-Drop Validation Gate...")
            verify_res = await session.execute(
                text(
                    """
                        SELECT id, name, open_time_mins_by_day, close_time_mins_by_day, duration_mins, cost_eur
                        FROM attractions;
                        """
                )
            )
            verified_rows = verify_res.fetchall()

            if len(verified_rows) != total_rows:
                raise RuntimeError(
                    f"Validation gate failed: Row count mismatch (expected {total_rows}, found {len(verified_rows)})"
                )

            for vr in verified_rows:
                v_id, v_name, v_open, v_close, v_dur, v_cost = vr
                if not v_open or len(v_open) != 7:
                    raise RuntimeError(
                        f"Validation gate failed for POI '{v_name}' (ID {v_id}): open vector invalid ({v_open})"
                    )
                if not v_close or len(v_close) != 7:
                    raise RuntimeError(
                        f"Validation gate failed for POI '{v_name}' (ID {v_id}): close vector invalid ({v_close})"
                    )
                if v_dur is None or v_dur <= 0:
                    raise RuntimeError(
                        f"Validation gate failed for POI '{v_name}' (ID {v_id}): duration invalid ({v_dur})"
                    )
                if v_cost is None or v_cost < 0.0:
                    raise RuntimeError(
                        f"Validation gate failed for POI '{v_name}' (ID {v_id}): cost invalid ({v_cost})"
                    )

            logger.info(f"Pre-Drop Validation Gate PASSED for all {total_rows} rows!")

            # 5. Drop legacy JSONB columns
            logger.info(
                "Step 4: Dropping legacy 'schedule' and 'financials' JSONB columns..."
            )
            await session.execute(
                text(
                    "ALTER TABLE attractions DROP COLUMN schedule, DROP COLUMN financials;"
                )
            )
            logger.info(
                "Legacy columns 'schedule' and 'financials' dropped successfully."
            )
        else:
            logger.info(
                "Legacy columns 'schedule' and 'financials' already dropped. Skipping column migration."
            )

    logger.info("Database migration completed successfully!")


if __name__ == "__main__":
    asyncio.run(run_migration())
