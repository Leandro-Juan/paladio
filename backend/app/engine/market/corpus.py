"""
Paladio Deal Engine Route Market Corpus Bootstrapper & Fleet Pre-Warmer.
Orchestrates multi-month forward calendar sweeps (300+ real daily market prices)
to generate instant day-zero route baselines without synthetic mocks or waiting weeks.
"""

import logging
import uuid
from datetime import datetime, timezone
from typing import Any

from app.db.models import (
    MarketPriceTickModel,
    RouteBaselineModel,
    RouteCorpusStatusModel,
)
from app.engine.market.baselines import compute_route_baseline
from app.engine.market.config import config
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

logger = logging.getLogger(__name__)


async def backfill_route_corpus(
    session: AsyncSession,
    origin_iata: str,
    destination_code: str,
    months_ahead: int | None = None,
    feed: Any | None = None,
    bidirectional: bool = True,
) -> dict[str, Any]:
    """
    Performs forward calendar sweep for (origin, destination), ingests real daily fares
    into market_price_ticks and price_daily, computes empirical baselines immediately,
    and updates RouteCorpusStatusModel. If bidirectional=True, also sweeps reverse route.
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

    # 2. Execute sweep via unified sweep engine per PLAN.md P3.6
    from app.engine.market.adapters import CompositeFlightFeed
    from app.engine.market.sweep import sweep_route

    flight_provider = feed if feed is not None else CompositeFlightFeed()
    try:
        sweep_res = await sweep_route(
            session=session,
            provider=flight_provider,
            origin=origin,
            dest=dest,
            months_ahead=months_ahead,
            run_id=ingest_run_id,
        )
    except Exception as e:
        logger.error(f"Error in unified route sweep for {origin}->{dest}: {e}")
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

    inserted_ticks = sweep_res["ticks_inserted"]

    # 3. Compute route baselines immediately
    baselines_count = await compute_route_baseline(session, origin, dest)

    # 4. Determine overall corpus metrics and confidence from real stored observations
    summary_stmt = select(
        func.min(MarketPriceTickModel.base_price_cents),
        func.max(MarketPriceTickModel.base_price_cents),
        func.count(MarketPriceTickModel.id),
        func.count(func.distinct(MarketPriceTickModel.depart_date)),
    ).where(
        MarketPriceTickModel.origin_iata == origin,
        MarketPriceTickModel.destination_code == dest,
        MarketPriceTickModel.asset_type == "flight",
    )
    s_res = await session.execute(summary_stmt)
    min_cents, max_cents, total_ticks_db, distinct_dates_db = s_res.first() or (
        None,
        None,
        0,
        0,
    )

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
    corpus_status.ticks_ingested = total_ticks_db
    corpus_status.depart_dates_count = distinct_dates_db
    corpus_status.min_price_cents = min_cents
    corpus_status.max_price_cents = max_cents
    corpus_status.median_price_cents = (
        int(round((min_cents + max_cents) / 2)) if min_cents and max_cents else None
    )
    corpus_status.error_message = None
    corpus_status.last_backfill_at = now
    await session.commit()

    logger.info(
        f"[Corpus Sweep] Backfilled {inserted_ticks} new ticks (total {total_ticks_db}) across {distinct_dates_db} dates for {origin}->{dest}. Baseline conf: {derived_conf}"
    )

    return_leg_res = None
    if bidirectional:
        try:
            return_leg_res = await backfill_route_corpus(
                session=session,
                origin_iata=dest,
                destination_code=origin,
                months_ahead=months_ahead,
                feed=feed,
                bidirectional=False,
            )
        except Exception as e:
            logger.warning(f"Could not backfill return leg {dest}->{origin}: {e}")

    median_cents = corpus_status.median_price_cents

    return {
        "status": "ready",
        "confidence": derived_conf,
        "ticks_ingested": inserted_ticks,
        "depart_dates_count": distinct_dates_db,
        "min_price_eur": round(min_cents / 100.0, 2) if min_cents else None,
        "max_price_eur": round(max_cents / 100.0, 2) if max_cents else None,
        "median_price_eur": round(median_cents / 100.0, 2) if median_cents else None,
        "baselines_computed": baselines_count,
        "origin_iata": origin,
        "destination_code": dest,
        "return_leg": return_leg_res,
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


async def get_top_candidate_deal_dates(
    session: AsyncSession,
    origin_iata: str,
    destination_code: str,
    limit: int = 5,
) -> list[str]:
    """
    Returns the top N lowest-fare departure dates for the route
    from stored market price ticks to target hotel pre-warming.
    Zero synthetic or hardcoded data.
    """
    from datetime import date
    from app.db.models import MarketPriceTickModel
    from sqlalchemy import func

    today = date.today()
    stmt = (
        select(
            MarketPriceTickModel.depart_date,
            func.min(MarketPriceTickModel.base_price_cents),
        )
        .where(
            MarketPriceTickModel.origin_iata == origin_iata.upper(),
            MarketPriceTickModel.destination_code == destination_code.upper(),
            MarketPriceTickModel.asset_type == "flight",
            MarketPriceTickModel.depart_date >= today,
        )
        .group_by(MarketPriceTickModel.depart_date)
        .order_by(func.min(MarketPriceTickModel.base_price_cents).asc())
        .limit(limit)
    )
    res = await session.execute(stmt)
    rows = res.all()
    return [row[0].isoformat() for row in rows]
