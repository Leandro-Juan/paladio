"""Recalculates and converts OSM charge tags to dynamic EUR values across all attractions."""

import asyncio

from app.db.session import async_session
from app.services.poi_pricing_service import parse_osm_charge
from sqlalchemy import text


async def run_migration():
    async with async_session() as session:
        query = text("""
            SELECT id, name, city, cost_eur, cost_source, metadata->'tags'->>'charge' as osm_charge
            FROM attractions
            WHERE cost_source = 'osm_charge_tag'
               OR (metadata->'tags'->>'charge' IS NOT NULL AND cost_eur > 50);
        """)
        res = await session.execute(query)
        rows = res.fetchall()
        print(f"Total candidates to inspect: {len(rows)}")

        updated_count = 0
        for r in rows:
            id_, name, city, old_cost, cost_src, charge = r
            if not charge:
                continue
            new_cost, is_free = parse_osm_charge(charge, city or "")
            if new_cost is not None and abs(new_cost - float(old_cost or 0.0)) > 0.01:
                update_stmt = text("""
                    UPDATE attractions
                    SET cost_eur = :new_cost,
                        cost_is_estimated = :is_est,
                        cost_source = 'osm_charge_tag'
                    WHERE id = :id
                """)
                await session.execute(
                    update_stmt, {"new_cost": new_cost, "is_est": is_free, "id": id_}
                )
                print(
                    f"Updated {name} ({city}): '{charge}' -> was {old_cost} EUR, now {new_cost} EUR"
                )
                updated_count += 1
            elif new_cost is None and cost_src == "osm_charge_tag":
                # E.g. purely percentage charge "10%", "16%" -> reset to category benchmark
                update_stmt = text("""
                    UPDATE attractions
                    SET cost_eur = 0.0,
                        cost_is_estimated = true,
                        cost_source = 'category_benchmark_estimate'
                    WHERE id = :id
                """)
                await session.execute(update_stmt, {"id": id_})
                print(
                    f"Reset percentage charge {name} ({city}): '{charge}' to estimate 0.0 EUR"
                )
                updated_count += 1

        await session.commit()
        print(
            f"\nMigration complete. Successfully updated {updated_count} attractions."
        )


if __name__ == "__main__":
    asyncio.run(run_migration())
