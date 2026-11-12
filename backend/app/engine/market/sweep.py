"""
Paladio Deal Engine Flight Sweep and Ingestion Engine.
Executes resilient forward calendar sweeps across monitored corridors,
maintains audit coverage per route-month, dedupes observations by hash,
and rolls up true historical observations into price_daily.
Complies with PLAN.md Phases 2 and 3 and Strict Token Conservation Protocol.
"""

from __future__ import annotations

import calendar
import hashlib
import json
import logging
import uuid
from datetime import date, datetime, timezone
from typing import Any, Sequence

from sqlalchemy import select, text, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models import (
    DealWatchAlertModel,
    FXRateModel,
    MarketPriceTickModel,
    MarketSweepRunModel,
    RouteCorpusStatusModel,
)
from app.db.session import async_session
from app.engine.market.config import config
from app.engine.market.ports import FareObservation, FareProvider
from app.engine.market.providers.aviasales import AviasalesProvider

logger = logging.getLogger(__name__)


def compute_fare_observation_hash(
    asset_type: str,
    origin: str,
    dest: str,
    depart_date: date,
    return_date: date | None,
    price_cents: int,
    source: str,
    market: str,
    found_at: datetime,
) -> bytes:
    """
    Computes deterministic SHA-256 hash over underlying fare observation attributes
    per PLAN.md P3.3: (asset, route, depart_date, return_date, price, source, market, found_at).
    """
    ret_str = return_date.isoformat() if return_date else "none"
    found_date_str = found_at.date().isoformat()
    raw_key = (
        f"{asset_type.lower()}:"
        f"{origin.upper()}:{dest.upper()}:"
        f"{depart_date.isoformat()}:{ret_str}:"
        f"{price_cents}:"
        f"{source.lower()}:{market.lower()}:"
        f"{found_date_str}"
    )
    return hashlib.sha256(raw_key.encode("utf-8")).digest()


async def resolve_fx_conversion(
    session: AsyncSession,
    original_price_cents: int,
    original_currency: str,
    as_of_date: date,
) -> tuple[int, float, date | None]:
    """
    Converts original currency into EUR base price cents.
    Enforces maximum FX rate staleness check per PLAN.md P3.5.
    Returns: (base_price_cents, fx_rate, fx_rate_date).
    """
    curr = original_currency.upper()
    if curr == "EUR":
        return original_price_cents, 1.0, as_of_date

    stmt = (
        select(FXRateModel.rate, FXRateModel.as_of)
        .where(
            FXRateModel.base_currency == "EUR",
            FXRateModel.quote_currency == curr,
        )
        .order_by(FXRateModel.as_of.desc())
        .limit(1)
    )
    res = await session.execute(stmt)
    row = res.first()

    if not row:
        raise ValueError(f"No FX conversion rate found for EUR/{curr}")

    rate_val, rate_date = row
    rate_float = float(rate_val)
    if rate_float <= 0.0:
        raise ValueError(f"Invalid FX rate <= 0 for EUR/{curr}: {rate_val}")

    age_days = (as_of_date - rate_date).days
    if age_days > config.FX_MAX_AGE_DAYS:
        raise ValueError(
            f"FX rate for EUR/{curr} dated {rate_date} is {age_days} days old, "
            f"exceeding max staleness of {config.FX_MAX_AGE_DAYS} days"
        )

    # 1 EUR = rate_float CURR -> CURR / rate_float = EUR
    base_price_cents = int(round(original_price_cents / rate_float))
    return base_price_cents, rate_float, rate_date


async def ingest_fare_observations(
    session: AsyncSession,
    observations: Sequence[FareObservation],
    ingest_run_id: str | None = None,
) -> int:
    """
    Idempotently ingests FareObservation records into market_price_ticks and price_daily.
    Performs deduplication via compute_fare_observation_hash:
    - If hash exists: updates last_seen_at, skips insertion.
    - If new: converts FX, stores original and landed amounts, writes null return_date/nights for one-ways.
    - Rolls up into price_daily using found_at date as bucket per PLAN.md P3.4.
    Returns count of newly inserted ticks.
    """
    if not observations:
        return 0

    now = datetime.now(timezone.utc)
    run_id = ingest_run_id or str(uuid.uuid4())
    inserted_count = 0

    for obs in observations:
        h = compute_fare_observation_hash(
            asset_type="flight",
            origin=obs.origin,
            dest=obs.destination,
            depart_date=obs.depart_date,
            return_date=obs.return_date,
            price_cents=obs.price_cents,
            source=obs.source,
            market=obs.market,
            found_at=obs.found_at,
        )

        # Check existing observation by hash
        check_stmt = (
            select(MarketPriceTickModel.id)
            .where(MarketPriceTickModel.content_hash == h)
            .limit(1)
        )
        res = await session.execute(check_stmt)
        existing_id = res.scalar_one_or_none()

        if existing_id is not None:
            # Observation already exists: update last_seen_at
            update_stmt = (
                update(MarketPriceTickModel)
                .where(MarketPriceTickModel.content_hash == h)
                .values(last_seen_at=now)
            )
            await session.execute(update_stmt)
            continue

        # Convert FX if necessary
        try:
            base_cents, fx_rate, fx_date = await resolve_fx_conversion(
                session=session,
                original_price_cents=obs.price_cents,
                original_currency=obs.currency,
                as_of_date=obs.found_at.date(),
            )
        except Exception as fx_err:
            logger.warning(
                f"[Sweep Ingest] FX conversion failed for {obs.origin}->{obs.destination} "
                f"({obs.currency} {obs.price_cents}): {fx_err}"
            )
            continue

        lead_time = max((obs.depart_date - now.date()).days, 0)
        meta = {
            "carrier": obs.carrier,
            "flight_number": obs.flight_number,
            "stops": obs.stops,
            "deep_link": obs.deep_link,
            "flags": obs.flags or {},
            "source_market": obs.market,
        }
        if obs.depart_time:
            meta["depart_local"] = obs.depart_time.isoformat()
        if obs.arrival_time:
            meta["arrival_local"] = obs.arrival_time.isoformat()

        tick_stmt = text("""
            INSERT INTO market_price_ticks (
                id, observed_at, asset_type, origin_iata, destination_code, dest_airport_iata,
                depart_date, return_date, nights, trip_type, lead_time_days, market, currency,
                base_price_cents, landed_price_cents, original_price_cents, original_currency,
                fx_rate, fx_rate_date, stat, sample_n, quality_tier, source, source_class,
                is_aggregated, source_observed_at, last_seen_at, is_exploration,
                content_hash, metadata_json, ingest_run_id
            ) VALUES (
                :id, :observed_at, 'flight', :origin_iata, :dest_code, :dest_iata,
                :depart_date, :return_date, :nights, :trip_type, :lead_time_days, :market, 'EUR',
                :base_price_cents, :base_price_cents, :orig_cents, :orig_curr,
                :fx_rate, :fx_rate_date, 'single', 1, 'standard', :source, :source_class,
                false, :source_observed_at, :last_seen_at, false,
                :content_hash, :metadata_json, :ingest_run_id
            ) ON CONFLICT (content_hash, observed_at) DO NOTHING
        """)

        await session.execute(
            tick_stmt,
            {
                "id": str(uuid.uuid4()),
                "observed_at": now,
                "origin_iata": obs.origin,
                "dest_code": obs.destination,
                "dest_iata": obs.destination,
                "depart_date": obs.depart_date,
                "return_date": obs.return_date,
                "nights": None
                if obs.trip_type == "one_way"
                else (
                    (obs.return_date - obs.depart_date).days
                    if obs.return_date
                    else None
                ),
                "trip_type": obs.trip_type,
                "lead_time_days": lead_time,
                "market": obs.market.lower(),
                "base_price_cents": base_cents,
                "orig_cents": obs.price_cents,
                "orig_curr": obs.currency.upper(),
                "fx_rate": fx_rate,
                "fx_rate_date": fx_date,
                "source": obs.source,
                "source_class": obs.source_class,
                "source_observed_at": obs.found_at,
                "last_seen_at": now,
                "content_hash": h,
                "metadata_json": json.dumps(meta),
                "ingest_run_id": run_id,
            },
        )
        inserted_count += 1

        # Rollup into price_daily using found_at date as observation bucket per PLAN.md P3.4
        daily_bucket = obs.found_at.date()
        daily_nights = (
            0
            if obs.trip_type == "one_way"
            else ((obs.return_date - obs.depart_date).days if obs.return_date else 0)
        )

        daily_stmt = text("""
            INSERT INTO price_daily (
                bucket, asset_type, origin_iata, destination_code, depart_date,
                nights, source_class, source, currency, min_base, n_ticks
            ) VALUES (
                :bucket, 'flight', :origin_iata, :dest_code, :depart_date,
                :nights, :source_class, :source, 'EUR', :min_base, 1
            )
            ON CONFLICT (bucket, asset_type, origin_iata, destination_code, depart_date, nights, source_class, source, currency)
            DO UPDATE SET
                min_base = LEAST(price_daily.min_base, EXCLUDED.min_base),
                n_ticks = price_daily.n_ticks + 1
        """)
        await session.execute(
            daily_stmt,
            {
                "bucket": daily_bucket,
                "origin_iata": obs.origin,
                "dest_code": obs.destination,
                "depart_date": obs.depart_date,
                "nights": daily_nights,
                "source_class": obs.source_class,
                "source": obs.source,
                "min_base": base_cents,
            },
        )

    await session.commit()
    return inserted_count


async def sweep_route_month(
    session: AsyncSession,
    provider: FareProvider,
    origin: str,
    dest: str,
    month_date: date,
    run_date: date,
    market: str = "es",
    run_id: str | None = None,
) -> tuple[int, int]:
    """
    Sweeps a single (origin, destination, month) slice.
    Records route_month_coverage row (even on 0 observations).
    Returns (new_ticks_inserted, days_with_price).
    """
    month_str = month_date.strftime("%Y-%m")
    days_in_month = calendar.monthrange(month_date.year, month_date.month)[1]
    cov_id = f"{run_date.isoformat()}_{origin}_{dest}_{month_str}"

    observations = await provider.fetch_month(
        origin=origin,
        dest=dest,
        month=month_date,
        trip_type="one_way",
    )

    distinct_days = {obs.depart_date for obs in observations}
    days_with_price = len(distinct_days)
    newest_found = max((obs.found_at for obs in observations), default=None)
    oldest_found = min((obs.found_at for obs in observations), default=None)

    # Upsert route_month_coverage
    cov_stmt = text("""
        INSERT INTO route_month_coverage (
            id, run_date, origin, dest, month, days_in_month, days_with_price,
            newest_found_at, oldest_found_at, source, market
        ) VALUES (
            :id, :run_date, :origin, :dest, :month, :days_in_month, :days_with_price,
            :newest_found_at, :oldest_found_at, 'aviasales', :market
        )
        ON CONFLICT (id) DO UPDATE SET
            days_with_price = EXCLUDED.days_with_price,
            newest_found_at = EXCLUDED.newest_found_at,
            oldest_found_at = EXCLUDED.oldest_found_at
    """)
    await session.execute(
        cov_stmt,
        {
            "id": cov_id,
            "run_date": run_date,
            "origin": origin,
            "dest": dest,
            "month": month_str,
            "days_in_month": days_in_month,
            "days_with_price": days_with_price,
            "newest_found_at": newest_found,
            "oldest_found_at": oldest_found,
            "market": market.lower(),
        },
    )
    await session.commit()

    inserted = 0
    if observations:
        inserted = await ingest_fare_observations(
            session=session,
            observations=observations,
            ingest_run_id=run_id,
        )

    return inserted, days_with_price


async def sweep_route(
    session: AsyncSession,
    provider: FareProvider,
    origin: str,
    dest: str,
    months_ahead: int = 11,
    run_date: date | None = None,
    run_id: str | None = None,
    market: str = "es",
) -> dict[str, Any]:
    """
    Sweeps up to months_ahead forward calendar months for directed corridor origin->dest.
    Idempotent and isolated per route: failures on individual months or routes do not crash run.
    """
    today = run_date or date.today()
    total_ticks = 0
    total_days_with_price = 0
    months_processed = 0
    errors: list[str] = []

    month_dates: list[date] = []
    for i in range(months_ahead):
        y = today.year + (today.month - 1 + i) // 12
        m = (today.month - 1 + i) % 12 + 1
        month_dates.append(date(y, m, 1))

    for m_date in month_dates:
        try:
            inserted, days_cnt = await sweep_route_month(
                session=session,
                provider=provider,
                origin=origin,
                dest=dest,
                month_date=m_date,
                run_date=today,
                market=market,
                run_id=run_id,
            )
            total_ticks += inserted
            total_days_with_price += days_cnt
            months_processed += 1
        except Exception as exc:
            err_msg = f"{origin}->{dest} ({m_date.strftime('%Y-%m')}): {exc}"
            logger.warning(f"[Sweep Route Month Failed] {err_msg}")
            errors.append(err_msg)
            await session.rollback()

    return {
        "origin": origin,
        "dest": dest,
        "months_total": months_ahead,
        "months_ok": months_processed,
        "ticks_inserted": total_ticks,
        "days_with_price": total_days_with_price,
        "errors": errors,
    }


async def run_daily_flight_sweep(
    session: AsyncSession | None = None,
    provider: FareProvider | None = None,
    pilot_routes: Sequence[tuple[str, str]] | None = None,
    months_ahead: int | None = None,
) -> dict[str, Any]:
    """
    Top-level daily orchestrator per PLAN.md Phase 2.7 & 2.8.
    Sweeps 11 months forward across active alert corridors and pilot routes in both directions.
    Maintains market_sweep_runs audit row throughout execution.
    """
    run_id = str(uuid.uuid4())
    started_at = datetime.now(timezone.utc)
    today = started_at.date()
    horizon = months_ahead or config.CORPUS_HORIZON_MONTHS
    flight_provider = provider or AviasalesProvider()

    async def _execute_sweep(sess: AsyncSession) -> dict[str, Any]:
        # 1. Initialize market_sweep_runs row
        sweep_run = MarketSweepRunModel(
            run_id=run_id,
            started_at=started_at,
            provider="aviasales",
            status="running",
            routes_total=0,
            routes_ok=0,
            calls_made=0,
            calls_failed=0,
        )
        sess.add(sweep_run)
        await sess.commit()

        # 2. Collect directed routes to sweep
        directed_routes: set[tuple[str, str]] = set()

        if pilot_routes:
            for orig, dst in pilot_routes:
                directed_routes.add((orig.upper(), dst.upper()))
                directed_routes.add((dst.upper(), orig.upper()))  # Bidirectional

        # Also collect active deal watch alerts
        alert_stmt = select(
            DealWatchAlertModel.origin_iata, DealWatchAlertModel.destinations
        ).where(DealWatchAlertModel.is_active.is_(True))
        alert_res = await sess.execute(alert_stmt)
        for orig, dests in alert_res.all():
            if dests and isinstance(dests, list):
                for dst in dests:
                    if dst and len(dst) == 3:
                        directed_routes.add((orig.upper(), dst.upper()))
                        directed_routes.add((dst.upper(), orig.upper()))

        # Also collect active RouteCorpusStatusModel routes
        corpus_stmt = select(
            RouteCorpusStatusModel.origin_iata, RouteCorpusStatusModel.destination_code
        )
        corpus_res = await sess.execute(corpus_stmt)
        for orig, dst in corpus_res.all():
            if orig and dst and len(orig) == 3 and len(dst) == 3:
                directed_routes.add((orig.upper(), dst.upper()))
                directed_routes.add((dst.upper(), orig.upper()))

        sweep_run.routes_total = len(directed_routes)
        await sess.commit()

        routes_ok = 0
        calls_made = 0
        calls_failed = 0
        total_ticks_inserted = 0

        # 3. Sweep each directed route with per-route fault isolation
        for orig, dst in sorted(directed_routes):
            try:
                res = await sweep_route(
                    session=sess,
                    provider=flight_provider,
                    origin=orig,
                    dest=dst,
                    months_ahead=horizon,
                    run_date=today,
                    run_id=run_id,
                )
                calls_made += res["months_ok"]
                calls_failed += len(res["errors"])
                total_ticks_inserted += res["ticks_inserted"]
                if res["months_ok"] > 0:
                    routes_ok += 1
            except Exception as r_err:
                calls_failed += horizon
                logger.error(
                    f"[Daily Sweep] Unhandled route error on {orig}->{dst}: {r_err}"
                )
                await sess.rollback()

        # 4. Finalize sweep_run
        finished_at = datetime.now(timezone.utc)
        sweep_run.finished_at = finished_at
        sweep_run.routes_ok = routes_ok
        sweep_run.calls_made = calls_made
        sweep_run.calls_failed = calls_failed
        sweep_run.status = (
            "completed" if calls_failed == 0 or routes_ok > 0 else "failed"
        )
        await sess.commit()

        return {
            "run_id": run_id,
            "status": sweep_run.status,
            "started_at": started_at.isoformat(),
            "finished_at": finished_at.isoformat(),
            "routes_total": len(directed_routes),
            "routes_ok": routes_ok,
            "calls_made": calls_made,
            "calls_failed": calls_failed,
            "ticks_inserted": total_ticks_inserted,
        }

    if session is not None:
        return await _execute_sweep(session)
    async with async_session() as local_sess:
        return await _execute_sweep(local_sess)
