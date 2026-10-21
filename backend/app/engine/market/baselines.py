"""
Paladio Deal Engine Route Baselines & Fee Models Engine.
Computes multi-level quantiles from price_daily and calculates learned fee ratios.
"""

import logging
from datetime import date, datetime, timedelta, timezone

import numpy as np
from app.db.models import PriceDailyModel, RouteBaselineModel
from app.engine.market.config import config
from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession

logger = logging.getLogger(__name__)


def get_lead_bucket_label(lead_days: int) -> str:
    for low, high in config.LEAD_BUCKETS:
        if high is None:
            if lead_days >= low:
                return f"{low}+"
        elif low <= lead_days <= high:
            return f"{low}-{high}"
    return "all"


async def compute_route_baselines(session: AsyncSession) -> int:
    """
    Computes statistical baselines for all active route pairs across price_daily,
    writing quantiles (q02, q05, q10, q25, q50, q75) at full, drop_lead, and drop_month levels.
    """
    now = datetime.now(timezone.utc)
    window_start = now.date() - timedelta(days=config.BASELINE_WINDOW_DAYS)

    # 1. Fetch raw daily minima
    stmt = select(PriceDailyModel).filter(PriceDailyModel.bucket >= window_start)
    res = await session.execute(stmt)
    records = res.scalars().all()

    if not records:
        logger.info("No daily price records available to build route baselines.")
        return 0

    # Group records by (asset_type, origin_iata, destination_code, depart_month, lead_bucket, source_class, currency)
    pools: dict[tuple, list[PriceDailyModel]] = {}
    for r in records:
        lead_days = max((r.depart_date - r.bucket).days, 0)
        bucket_label = get_lead_bucket_label(lead_days)
        dep_month = r.depart_date.month

        # Full level key
        key_full = (
            r.asset_type,
            r.origin_iata,
            r.destination_code,
            dep_month,
            bucket_label,
            r.source_class,
            r.currency,
            "full",
        )
        pools.setdefault(key_full, []).append(r)

        # Drop lead level key
        key_drop_lead = (
            r.asset_type,
            r.origin_iata,
            r.destination_code,
            dep_month,
            "all",
            r.source_class,
            r.currency,
            "drop_lead",
        )
        pools.setdefault(key_drop_lead, []).append(r)

        # Drop month level key
        key_drop_month = (
            r.asset_type,
            r.origin_iata,
            r.destination_code,
            0,
            "all",
            r.source_class,
            r.currency,
            "drop_month",
        )
        pools.setdefault(key_drop_month, []).append(r)

    computed_count = 0
    quantiles = config.BASELINE_QUANTILES

    for (
        asset_type,
        orig,
        dest,
        dep_m,
        lead_b,
        src_cls,
        curr,
        level,
    ), group in pools.items():
        prices = [g.min_base for g in group]
        n_rows = len(prices)
        obs_days = len(set(g.bucket for g in group))
        dep_dates = len(set(g.depart_date for g in group))

        # Compute quantiles using numpy
        q_vals = np.quantile(prices, quantiles)
        q02, q05, q10, q25, q50, q75, q90 = [int(round(float(q))) for q in q_vals]

        # Derive statistical confidence tier
        if (
            obs_days >= config.MIN_BASELINE_OBS_DAYS
            and dep_dates >= config.MIN_BASELINE_DEPART_DATES
            and n_rows >= config.MIN_BASELINE_ROWS
        ):
            conf = "established"
        elif n_rows >= 15:
            conf = "provisional"
        else:
            conf = "building"

        upsert_stmt = text("""
            INSERT INTO route_baselines (
                asset_type, origin_iata, destination_code, depart_month, lead_bucket,
                source_class, currency, level, n_rows, n_obs_days, n_depart_dates,
                q02, q05, q10, q25, q50, q75, q90, confidence, window_start, window_end, computed_at
            ) VALUES (
                :asset_type, :origin_iata, :destination_code, :depart_month, :lead_bucket,
                :source_class, :currency, :level, :n_rows, :n_obs_days, :n_depart_dates,
                :q02, :q05, :q10, :q25, :q50, :q75, :q90, :confidence, :window_start, :window_end, :computed_at
            )
            ON CONFLICT (asset_type, origin_iata, destination_code, depart_month, lead_bucket, source_class, currency, level)
            DO UPDATE SET
                n_rows = EXCLUDED.n_rows,
                n_obs_days = EXCLUDED.n_obs_days,
                n_depart_dates = EXCLUDED.n_depart_dates,
                q02 = EXCLUDED.q02,
                q05 = EXCLUDED.q05,
                q10 = EXCLUDED.q10,
                q25 = EXCLUDED.q25,
                q50 = EXCLUDED.q50,
                q75 = EXCLUDED.q75,
                q90 = EXCLUDED.q90,
                confidence = EXCLUDED.confidence,
                window_start = EXCLUDED.window_start,
                window_end = EXCLUDED.window_end,
                computed_at = EXCLUDED.computed_at
        """)
        await session.execute(
            upsert_stmt,
            {
                "asset_type": asset_type,
                "origin_iata": orig,
                "destination_code": dest,
                "depart_month": dep_m,
                "lead_bucket": lead_b,
                "source_class": src_cls,
                "currency": curr,
                "level": level,
                "n_rows": n_rows,
                "n_obs_days": obs_days,
                "n_depart_dates": dep_dates,
                "q02": q02,
                "q05": q05,
                "q10": q10,
                "q25": q25,
                "q50": q50,
                "q75": q75,
                "q90": q90,
                "confidence": conf,
                "window_start": window_start,
                "window_end": now.date(),
                "computed_at": now,
            },
        )
        computed_count += 1

    # 3. Dynamically learn fee models from observed pairs in market_price_ticks
    fee_learn_stmt = text("""
        INSERT INTO fee_models (asset_type, source, destination_code, provider, ratio_p50, n, n_pairs, computed_at)
        SELECT 
            asset_type,
            source,
            destination_code,
            source as provider,
            PERCENTILE_CONT(0.50) WITHIN GROUP (ORDER BY (landed_price_cents::float / base_price_cents::float)) as ratio_p50,
            COUNT(*) as n,
            COUNT(*) as n_pairs,
            :now as computed_at
        FROM market_price_ticks
        WHERE landed_price_cents IS NOT NULL 
          AND base_price_cents > 0 
          AND landed_price_cents >= base_price_cents
        GROUP BY asset_type, source, destination_code
        HAVING COUNT(*) >= 5
        ON CONFLICT (asset_type, source, destination_code)
        DO UPDATE SET 
            ratio_p50 = EXCLUDED.ratio_p50, 
            n = EXCLUDED.n, 
            n_pairs = EXCLUDED.n_pairs, 
            computed_at = EXCLUDED.computed_at
    """)
    await session.execute(fee_learn_stmt, {"now": now})

    await session.commit()
    logger.info(
        f"Computed {computed_count} route baseline records across {len(pools)} pools."
    )
    return computed_count


async def compute_route_baseline(
    session: AsyncSession,
    origin_iata: str,
    destination_code: str,
    asset_type: str = "flight",
) -> int:
    """
    Computes statistical baselines for a single route pair immediately
    after a forward horizon backfill or scan, enabling instant day-zero intelligence.
    """
    now = datetime.now(timezone.utc)
    window_start = now.date() - timedelta(days=config.BASELINE_WINDOW_DAYS)

    stmt = select(PriceDailyModel).filter(
        PriceDailyModel.asset_type == asset_type,
        PriceDailyModel.origin_iata == origin_iata,
        PriceDailyModel.destination_code == destination_code,
        PriceDailyModel.bucket >= window_start,
    )
    res = await session.execute(stmt)
    records = res.scalars().all()

    if not records:
        logger.info(
            f"No price_daily records found for baseline compute: {origin_iata}->{destination_code}"
        )
        return 0

    pools: dict[tuple, list[PriceDailyModel]] = {}
    for r in records:
        lead_days = max((r.depart_date - r.bucket).days, 0)
        bucket_label = get_lead_bucket_label(lead_days)
        dep_month = r.depart_date.month

        key_full = (
            r.asset_type,
            r.origin_iata,
            r.destination_code,
            dep_month,
            bucket_label,
            r.source_class,
            r.currency,
            "full",
        )
        pools.setdefault(key_full, []).append(r)

        key_drop_lead = (
            r.asset_type,
            r.origin_iata,
            r.destination_code,
            dep_month,
            "all",
            r.source_class,
            r.currency,
            "drop_lead",
        )
        pools.setdefault(key_drop_lead, []).append(r)

        key_drop_month = (
            r.asset_type,
            r.origin_iata,
            r.destination_code,
            0,
            "all",
            r.source_class,
            r.currency,
            "drop_month",
        )
        pools.setdefault(key_drop_month, []).append(r)

    computed_count = 0
    quantiles = config.BASELINE_QUANTILES

    for (
        a_type,
        orig,
        dest,
        dep_m,
        lead_b,
        src_cls,
        curr,
        level,
    ), group in pools.items():
        prices = [g.min_base for g in group]
        n_rows = len(prices)
        obs_days = len(set(g.bucket for g in group))
        dep_dates = len(set(g.depart_date for g in group))

        q_vals = np.quantile(prices, quantiles)
        q02, q05, q10, q25, q50, q75, q90 = [int(round(float(q))) for q in q_vals]

        if (
            obs_days >= config.MIN_BASELINE_OBS_DAYS
            and dep_dates >= config.MIN_BASELINE_DEPART_DATES
            and n_rows >= config.MIN_BASELINE_ROWS
        ):
            conf = "established"
        elif n_rows >= 10:
            conf = "provisional"
        else:
            conf = "building"

        upsert_stmt = text("""
            INSERT INTO route_baselines (
                asset_type, origin_iata, destination_code, depart_month, lead_bucket,
                source_class, currency, level, n_rows, n_obs_days, n_depart_dates,
                q02, q05, q10, q25, q50, q75, q90, confidence, window_start, window_end, computed_at
            ) VALUES (
                :asset_type, :origin_iata, :destination_code, :depart_month, :lead_bucket,
                :source_class, :currency, :level, :n_rows, :n_obs_days, :n_depart_dates,
                :q02, :q05, :q10, :q25, :q50, :q75, :q90, :confidence, :window_start, :window_end, :computed_at
            )
            ON CONFLICT (asset_type, origin_iata, destination_code, depart_month, lead_bucket, source_class, currency, level)
            DO UPDATE SET
                n_rows = EXCLUDED.n_rows,
                n_obs_days = EXCLUDED.n_obs_days,
                n_depart_dates = EXCLUDED.n_depart_dates,
                q02 = EXCLUDED.q02,
                q05 = EXCLUDED.q05,
                q10 = EXCLUDED.q10,
                q25 = EXCLUDED.q25,
                q50 = EXCLUDED.q50,
                q75 = EXCLUDED.q75,
                q90 = EXCLUDED.q90,
                confidence = EXCLUDED.confidence,
                window_start = EXCLUDED.window_start,
                window_end = EXCLUDED.window_end,
                computed_at = EXCLUDED.computed_at
        """)
        await session.execute(
            upsert_stmt,
            {
                "asset_type": a_type,
                "origin_iata": orig,
                "destination_code": dest,
                "depart_month": dep_m,
                "lead_bucket": lead_b,
                "source_class": src_cls,
                "currency": curr,
                "level": level,
                "n_rows": n_rows,
                "n_obs_days": obs_days,
                "n_depart_dates": dep_dates,
                "q02": q02,
                "q05": q05,
                "q10": q10,
                "q25": q25,
                "q50": q50,
                "q75": q75,
                "q90": q90,
                "confidence": conf,
                "window_start": window_start,
                "window_end": now.date(),
                "computed_at": now,
            },
        )
        computed_count += 1

    await session.commit()
    logger.info(
        f"Computed {computed_count} baselines for single route {origin_iata}->{destination_code}"
    )
    return computed_count


async def resolve_route_baseline_quantiles(
    session: AsyncSession,
    origin_iata: str,
    destination_code: str,
    depart_date: date,
    observation_date: date,
    asset_type: str = "flight",
    currency: str = "EUR",
) -> tuple[dict[str, int] | None, str | None, str]:
    """
    Finds empirical baseline quantiles following hierarchical fallback:
    full -> drop_lead -> drop_month.
    Returns (quantiles_dict, level, confidence).
    """
    dep_month = depart_date.month
    lead_days = max((depart_date - observation_date).days, 0)
    lead_bucket = get_lead_bucket_label(lead_days)

    best_candidate = None
    for level, month_val, lead_val in [
        ("full", dep_month, lead_bucket),
        ("drop_lead", dep_month, "all"),
        ("drop_month", 0, "all"),
    ]:
        stmt = (
            select(RouteBaselineModel)
            .filter(
                RouteBaselineModel.asset_type == asset_type,
                RouteBaselineModel.origin_iata == origin_iata,
                RouteBaselineModel.destination_code == destination_code,
                RouteBaselineModel.depart_month == month_val,
                RouteBaselineModel.lead_bucket == lead_val,
                RouteBaselineModel.level == level,
                RouteBaselineModel.currency == currency,
            )
            .order_by(RouteBaselineModel.n_rows.desc())
        )
        res = await session.execute(stmt)
        row = res.scalars().first()
        if row and row.n_rows >= 1:
            q_dict = {
                "q02": row.q02,
                "q05": row.q05,
                "q10": row.q10,
                "q25": row.q25,
                "q50": row.q50,
                "q75": row.q75,
                "q90": row.q90
                if row.q90 is not None
                else int(row.q75 + (row.q75 - row.q50) * 0.8),
            }
            conf = row.confidence or (
                "established"
                if row.n_obs_days >= config.MIN_BASELINE_OBS_DAYS
                else "provisional"
            )
            if row.n_rows >= 15:
                return q_dict, level, conf
            if best_candidate is None or row.n_rows > best_candidate[3]:
                best_candidate = (q_dict, level, conf, row.n_rows)

    if best_candidate:
        return best_candidate[0], best_candidate[1], best_candidate[2]

    return None, None, "building"


async def resolve_baseline_median(
    session: AsyncSession,
    asset_type: str,
    origin_iata: str,
    destination_code: str,
    depart_date: date,
    observation_date: date,
    currency: str = "EUR",
) -> tuple[int | None, str | None]:
    """
    Finds the appropriate statistical baseline median (q50) following the fallback hierarchy:
    full -> drop_lead -> drop_month.
    """
    q_dict, level, _ = await resolve_route_baseline_quantiles(
        session,
        origin_iata=origin_iata,
        destination_code=destination_code,
        depart_date=depart_date,
        observation_date=observation_date,
        asset_type=asset_type,
        currency=currency,
    )
    if q_dict and "q50" in q_dict:
        return q_dict["q50"], level
    return None, None
