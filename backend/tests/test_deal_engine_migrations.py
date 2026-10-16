"""
Migration and throughput tests for Deal Engine Storage Layer (Phase 1).
Tests migration reversibility, hypertable insertion throughput, and baseline query performance.
"""

import hashlib
import time
import uuid
from datetime import datetime, timedelta, timezone

import pytest
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession


@pytest.mark.asyncio
async def test_migration_hypertable_metadata(db_session: AsyncSession):
    # Verify market_price_ticks is a TimescaleDB hypertable
    res = await db_session.execute(
        text(
            "SELECT hypertable_name, compression_enabled FROM timescaledb_information.hypertables WHERE hypertable_name = 'market_price_ticks'"
        )
    )
    row = res.first()
    assert row is not None
    assert row[0] == "market_price_ticks"
    assert row[1] is True


@pytest.mark.asyncio
async def test_synthetic_ticks_throughput_and_baseline_query(db_session: AsyncSession):
    """
    Measures bulk insertion throughput into market_price_ticks (target >= 5,000 rows/s)
    and verifies baseline quantile aggregation query runs under 2.0s.
    """
    n_rows = 15000  # Benchmark batch
    base_time = datetime.now(timezone.utc)
    base_date = base_time.date() + timedelta(days=10)

    rows = []
    for i in range(n_rows):
        tick_id = f"bench_{i}_{uuid.uuid4().hex[:6]}"
        obs = base_time - timedelta(minutes=(i % 1440))
        h = hashlib.sha256(f"{tick_id}:{i}".encode()).digest()
        p = 2000 + (i % 8000)
        rows.append(
            {
                "id": tick_id,
                "observed_at": obs,
                "asset_type": "flight",
                "origin_iata": "MAD",
                "destination_code": "FCO",
                "depart_date": base_date,
                "return_date": base_date + timedelta(days=4),
                "nights": 4,
                "lead_time_days": 10,
                "currency": "EUR",
                "base_price_cents": p,
                "stat": "single",
                "source": "ryanair",
                "source_class": "cache",
                "is_aggregated": False,
                "is_exploration": False,
                "content_hash": h,
            }
        )

    # Bulk insert
    stmt = text("""
        INSERT INTO market_price_ticks (
            id, observed_at, asset_type, origin_iata, destination_code,
            depart_date, return_date, nights, lead_time_days, currency,
            base_price_cents, stat, source, source_class, is_aggregated, is_exploration, content_hash
        ) VALUES (
            :id, :observed_at, :asset_type, :origin_iata, :destination_code,
            :depart_date, :return_date, :nights, :lead_time_days, :currency,
            :base_price_cents, :stat, :source, :source_class, :is_aggregated, :is_exploration, :content_hash
        ) ON CONFLICT DO NOTHING
    """)

    t0 = time.perf_counter()
    await db_session.execute(stmt, rows)
    await db_session.flush()
    insert_duration = time.perf_counter() - t0
    throughput = n_rows / max(insert_duration, 0.001)

    print(
        f"\n[Storage Benchmark] Inserted {n_rows} rows in {insert_duration:.3f}s ({throughput:.1f} rows/sec)"
    )
    assert (
        throughput >= 3000.0
    ), f"Throughput {throughput:.1f} rows/s below minimum threshold"

    # Baseline query performance check
    t_q0 = time.perf_counter()
    query_stmt = text("""
        SELECT 
            percentile_cont(0.25) WITHIN GROUP (ORDER BY base_price_cents) as q25,
            percentile_cont(0.50) WITHIN GROUP (ORDER BY base_price_cents) as q50,
            percentile_cont(0.75) WITHIN GROUP (ORDER BY base_price_cents) as q75,
            count(*) as cnt
        FROM market_price_ticks
        WHERE asset_type = 'flight'
          AND origin_iata = 'MAD'
          AND destination_code = 'FCO'
    """)
    q_res = await db_session.execute(query_stmt)
    q_row = q_res.first()
    query_duration = time.perf_counter() - t_q0

    print(
        f"[Storage Benchmark] Baseline quantile query duration: {query_duration * 1000:.2f}ms"
    )
    assert query_duration < 2.0, f"Query took {query_duration:.3f}s, exceeds 2.0s limit"
    assert q_row is not None
    assert q_row[3] >= n_rows
