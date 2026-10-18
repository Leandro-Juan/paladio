"""
Paladio Deal Engine Route Market Corpus Bootstrapper & Fleet Pre-Warmer.
Orchestrates multi-month forward calendar sweeps (300+ real daily market prices)
to generate instant day-zero route baselines without synthetic mocks or waiting weeks.
"""

import json
import logging
import uuid
from datetime import datetime, timezone
from typing import Any

from app.db.models import (
    RouteBaselineModel,
    RouteCorpusStatusModel,
)
from app.engine.market.adapters import RyanairFlightFeed
from app.engine.market.baselines import compute_route_baseline
from app.engine.market.config import config
from app.engine.market.ingest import compute_content_hash
from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession

logger = logging.getLogger(__name__)


async def backfill_route_corpus(
    session: AsyncSession,
    origin_iata: str,
    destination_code: str,
    months_ahead: int | None = None,
    feed: RyanairFlightFeed | None = None,
) -> dict[str, Any]:
    """
    Performs forward calendar sweep for (origin, destination), ingests ~300 real daily fares
    into market_price_ticks and price_daily, computes empirical baselines immediately,
    and updates RouteCorpusStatusModel.
    """
    if months_ahead is None:
        months_ahead = config.CORPUS_HORIZON_MONTHS

    origin = origin_iata.upper()
    dest = destination_code.upper()
    now = datetime.now(timezone.utc)
    ingest_run_id = str(uuid.uuid4())

    # 1. Update or create corpus status record
    status_stmt = select(RouteCorpusStatusModel).where(
        RouteCorpusStatusModel.origin_iata == origin,
        RouteCorpusStatusModel.destination_code == dest,
    )
    status_res = await session.execute(status_stmt)
    corpus_status = status_res.scalar_one_or_none()

    if not corpus_status:
        corpus_status = RouteCorpusStatusModel(
            origin_iata=origin,
            destination_code=dest,
            status="building",
            confidence="building",
            ticks_ingested=0,
            depart_dates_count=0,
            last_backfill_at=now,
        )
        session.add(corpus_status)
    else:
        corpus_status.status = "building"
        corpus_status.last_backfill_at = now
    await session.commit()

    # 2. Fetch forward calendar horizon of real daily fares
    if feed is None:
        feed = RyanairFlightFeed()

    try:
        quotes = await feed.fetch_calendar_horizon(
            origin, dest, months_ahead=months_ahead
        )
    except Exception as e:
        logger.error(f"Error fetching calendar horizon for {origin}->{dest}: {e}")
        corpus_status.status = "failed"
        corpus_status.error_message = str(e)
        await session.commit()
        return {
            "status": "failed",
            "error": str(e),
            "ticks_ingested": 0,
            "origin_iata": origin,
            "destination_code": dest,
        }

    if not quotes:
        logger.warning(f"No calendar fares returned for {origin}->{dest}")
        corpus_status.status = "failed"
        corpus_status.error_message = "No calendar fares returned from flight feed"
        await session.commit()
        return {
            "status": "failed",
            "error": "No fares found",
            "ticks_ingested": 0,
            "origin_iata": origin,
            "destination_code": dest,
        }

    # 3. Ingest real quotes into market_price_ticks & price_daily
    inserted_ticks = 0
    unique_dates = set()
    prices = []

    for q in quotes:
        dep_date = q.depart_time.date()
        ret_date = dep_date  # single-leg one-way observation
        lead_time = max((dep_date - now.date()).days, 0)
        unique_dates.add(dep_date)
        prices.append(q.base_price_cents)

        h = compute_content_hash(
            "flight",
            origin,
            dest,
            dep_date,
            ret_date,
            q.base_price_cents,
            "ryanair",
            source_observed_at=q.observed_at,
        )

        meta = {
            "carrier": q.carrier,
            "flight_number": q.flight_number,
            "stops": q.stops,
            "depart_local": q.depart_time.isoformat(),
            "arrival_local": q.arrival_time.isoformat(),
            "deep_link": q.deep_link,
            "horizon_sweep": True,
        }

        tick_stmt = text("""
            INSERT INTO market_price_ticks (
                id, observed_at, asset_type, origin_iata, destination_code, dest_airport_iata,
                depart_date, return_date, nights, lead_time_days, currency, base_price_cents,
                stat, sample_n, quality_tier, source, source_class, is_aggregated, is_exploration,
                content_hash, metadata_json, ingest_run_id
            ) VALUES (
                :id, :observed_at, 'flight', :origin_iata, :dest_code, :dest_iata,
                :depart_date, :return_date, 0, :lead_time_days, :currency, :base_price_cents,
                'min', 1, 'standard', 'ryanair', 'calendar_sweep', false, false,
                :content_hash, :metadata_json, :ingest_run_id
            ) ON CONFLICT (content_hash, observed_at) DO NOTHING
        """)
        await session.execute(
            tick_stmt,
            {
                "id": str(uuid.uuid4()),
                "observed_at": now,
                "origin_iata": origin,
                "dest_code": dest,
                "dest_iata": dest,
                "depart_date": dep_date,
                "return_date": ret_date,
                "lead_time_days": lead_time,
                "currency": q.currency,
                "base_price_cents": q.base_price_cents,
                "content_hash": h,
                "metadata_json": json.dumps(meta),
                "ingest_run_id": ingest_run_id,
            },
        )

        # Rollup into price_daily
        daily_stmt = text("""
            INSERT INTO price_daily (
                bucket, asset_type, origin_iata, destination_code, depart_date,
                nights, source_class, source, currency, min_base, n_ticks
            ) VALUES (
                :bucket, 'flight', :origin_iata, :dest_code, :depart_date,
                0, 'calendar_sweep', 'ryanair', :currency, :base_price_cents, 1
            )
            ON CONFLICT (bucket, asset_type, origin_iata, destination_code, depart_date, nights, source_class, source, currency)
            DO UPDATE SET 
                min_base = LEAST(price_daily.min_base, EXCLUDED.min_base),
                n_ticks = price_daily.n_ticks + 1
        """)
        await session.execute(
            daily_stmt,
            {
                "bucket": now.date(),
                "origin_iata": origin,
                "dest_code": dest,
                "depart_date": dep_date,
                "currency": q.currency,
                "base_price_cents": q.base_price_cents,
            },
        )
        inserted_ticks += 1

    await session.commit()

    # 4. Compute route baselines immediately
    baselines_count = await compute_route_baseline(session, origin, dest)

    # 5. Determine overall corpus metrics and confidence
    min_cents = min(prices) if prices else None
    max_cents = max(prices) if prices else None
    import numpy as np

    median_cents = int(round(float(np.median(prices)))) if prices else None

    # Check baseline confidence
    b_stmt = (
        select(RouteBaselineModel)
        .where(
            RouteBaselineModel.origin_iata == origin,
            RouteBaselineModel.destination_code == dest,
            RouteBaselineModel.level == "drop_month",
        )
        .limit(1)
    )
    b_res = await session.execute(b_stmt)
    baseline_row = b_res.scalar_one_or_none()
    derived_conf = baseline_row.confidence if baseline_row else "provisional"

    corpus_status.status = "ready"
    corpus_status.confidence = derived_conf
    corpus_status.ticks_ingested = inserted_ticks
    corpus_status.depart_dates_count = len(unique_dates)
    corpus_status.min_price_cents = min_cents
    corpus_status.max_price_cents = max_cents
    corpus_status.median_price_cents = median_cents
    corpus_status.error_message = None
    corpus_status.last_backfill_at = now
    await session.commit()

    logger.info(
        f"[Corpus Sweep] Backfilled {inserted_ticks} ticks across {len(unique_dates)} dates for {origin}->{dest}. Baseline conf: {derived_conf}"
    )

    return {
        "status": "ready",
        "confidence": derived_conf,
        "ticks_ingested": inserted_ticks,
        "depart_dates_count": len(unique_dates),
        "min_price_eur": round(min_cents / 100.0, 2) if min_cents else None,
        "max_price_eur": round(max_cents / 100.0, 2) if max_cents else None,
        "median_price_eur": round(median_cents / 100.0, 2) if median_cents else None,
        "baselines_computed": baselines_count,
        "origin_iata": origin,
        "destination_code": dest,
    }


async def get_route_corpus_status(
    session: AsyncSession, origin_iata: str, destination_code: str
) -> dict[str, Any]:
    """Retrieves current corpus status and telemetry for a route."""
    origin = origin_iata.upper()
    dest = destination_code.upper()

    stmt = select(RouteCorpusStatusModel).where(
        RouteCorpusStatusModel.origin_iata == origin,
        RouteCorpusStatusModel.destination_code == dest,
    )
    res = await session.execute(stmt)
    row = res.scalar_one_or_none()

    if not row:
        return {
            "origin_iata": origin,
            "destination_code": dest,
            "status": "building",
            "confidence": "building",
            "ticks_ingested": 0,
            "depart_dates_count": 0,
            "min_price_eur": None,
            "max_price_eur": None,
            "median_price_eur": None,
            "last_backfill_at": None,
        }

    return {
        "origin_iata": row.origin_iata,
        "destination_code": row.destination_code,
        "status": row.status,
        "confidence": row.confidence,
        "ticks_ingested": row.ticks_ingested,
        "depart_dates_count": row.depart_dates_count,
        "min_price_eur": round(row.min_price_cents / 100.0, 2)
        if row.min_price_cents
        else None,
        "max_price_eur": round(row.max_price_cents / 100.0, 2)
        if row.max_price_cents
        else None,
        "median_price_eur": round(row.median_price_cents / 100.0, 2)
        if row.median_price_cents
        else None,
        "last_backfill_at": row.last_backfill_at.isoformat()
        if row.last_backfill_at
        else None,
    }
