"""
Paladio Deal Engine Continuous Ingestion Pipeline.
Performs demand-driven scanning across active deal watch alerts,
ingests real live flight & lodging ticks into TimescaleDB with idempotent deduplication,
and updates price_daily rollups.
"""

import hashlib
import json
import logging
import uuid
from datetime import date, datetime, timedelta, timezone
from typing import Any

from app.db.models import (
    DealWatchAlertModel,
)
from app.engine.market.adapters import CompositeFlightFeed, OpenLodgingFeed
from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession

logger = logging.getLogger(__name__)


def compute_content_hash(
    asset_type: str,
    origin_iata: str,
    dest_code: str,
    depart_date: date,
    return_date: date,
    base_price_cents: int,
    source: str,
    source_observed_at: datetime | None = None,
) -> bytes:
    key_str = f"{asset_type}:{origin_iata}:{dest_code}:{depart_date.isoformat()}:{return_date.isoformat()}:{base_price_cents}:{source}"
    if source_observed_at:
        key_str += f":{source_observed_at.isoformat()}"
    return hashlib.sha256(key_str.encode("utf-8")).digest()


async def ingest_flight_ticks(
    session: AsyncSession,
    origin_iata: str,
    dest_iata: str,
    dest_code: str,
    date_from: date,
    date_to: date,
    feed: Any | None = None,
    ingest_run_id: str | None = None,
    run_id: str | None = None,
) -> int:
    """
    Polls live flight fares for origin -> destination across date window,
    inserts into market_price_ticks with duplicate suppression,
    and updates price_daily. Fully dynamic source, currency, and provider ladder.
    """
    if feed is None:
        feed = CompositeFlightFeed()
    effective_run_id = ingest_run_id or run_id or str(uuid.uuid4())

    quotes = await feed.fetch_cached_flights(
        origin_iata, dest_iata, date_from, date_to, session=session
    )
    if not quotes:
        logger.info(
            f"No flight quotes returned for {origin_iata}->{dest_iata} ({date_from} to {date_to})"
        )
        return 0

    now = datetime.now(timezone.utc)
    inserted_count = 0

    for quote in quotes:
        dep_date = quote.depart_time.date()
        ret_date = dep_date + timedelta(days=4)  # Default 4-night stay window
        nights = (ret_date - dep_date).days
        lead_time = max((dep_date - now.date()).days, 0)
        source = quote.source or "flight_feed"
        source_class = "live" if quote.is_live else "cache"

        h = compute_content_hash(
            "flight",
            origin_iata,
            dest_code,
            dep_date,
            ret_date,
            quote.base_price_cents,
            source,
            source_observed_at=quote.observed_at,
        )

        meta = {
            "carrier": quote.carrier,
            "flight_number": quote.flight_number,
            "stops": quote.stops,
            "depart_local": quote.depart_time.isoformat(),
            "arrival_local": quote.arrival_time.isoformat(),
            "deep_link": quote.deep_link,
        }

        # Idempotent insert into market_price_ticks
        tick_id = str(uuid.uuid4())
        stmt = text("""
            INSERT INTO market_price_ticks (
                id, observed_at, asset_type, origin_iata, destination_code, dest_airport_iata,
                depart_date, return_date, nights, lead_time_days, currency, base_price_cents,
                stat, source, source_class, is_aggregated, is_exploration, content_hash,
                ingest_run_id, metadata_json
            ) VALUES (
                :id, :observed_at, 'flight', :origin_iata, :destination_code, :dest_airport_iata,
                :depart_date, :return_date, :nights, :lead_time_days, :currency, :base_price_cents,
                'single', :source, :source_class, false, false, :content_hash,
                :ingest_run_id, :metadata_json
            ) ON CONFLICT (content_hash, observed_at) DO NOTHING
        """)

        res = await session.execute(
            stmt,
            {
                "id": tick_id,
                "observed_at": now,
                "origin_iata": origin_iata,
                "destination_code": dest_code,
                "dest_airport_iata": dest_iata,
                "depart_date": dep_date,
                "return_date": ret_date,
                "nights": nights,
                "lead_time_days": lead_time,
                "currency": quote.currency,
                "base_price_cents": quote.base_price_cents,
                "source": source,
                "source_class": source_class,
                "content_hash": h,
                "ingest_run_id": effective_run_id,
                "metadata_json": json.dumps(meta),
            },
        )
        if res.rowcount and res.rowcount > 0:
            inserted_count += 1

        # Update price_daily rollup
        daily_stmt = text("""
            INSERT INTO price_daily (
                bucket, asset_type, origin_iata, destination_code, depart_date,
                nights, source_class, source, currency, min_base, n_ticks
            ) VALUES (
                :bucket, 'flight', :origin_iata, :destination_code, :depart_date,
                :nights, :source_class, :source, :currency, :base_price_cents, 1
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
                "origin_iata": origin_iata,
                "destination_code": dest_code,
                "depart_date": dep_date,
                "nights": nights,
                "source_class": source_class,
                "source": source,
                "currency": quote.currency,
                "base_price_cents": quote.base_price_cents,
            },
        )

    await session.commit()
    logger.info(
        f"Ingested {inserted_count} new flight ticks for {origin_iata}->{dest_code}"
    )
    return inserted_count


async def ingest_lodging_ticks(
    session: AsyncSession,
    destination_code: str,
    check_in: date,
    check_out: date,
    feed: OpenLodgingFeed | None = None,
    ingest_run_id: str | None = None,
) -> int:
    """
    Ingests multi-provider lodging quotes into hotel_rate_observations, lodging_offers,
    and market_price_ticks.
    Zero synthetic or mock data.
    """
    if feed is None:
        feed = OpenLodgingFeed()
    if ingest_run_id is None:
        ingest_run_id = str(uuid.uuid4())

    quotes = await feed.search_offers(
        destination_code, check_in, check_out, adults=2, session=session
    )
    if not quotes:
        logger.warning(f"[Lodging Ingest] 0 quotes obtained for {destination_code}")
        return 0

    now = datetime.now(timezone.utc)
    nights = max((check_out - check_in).days, 1)
    lead_time = max((check_in - now.date()).days, 0)
    ingested_count = 0

    for quote in quotes:
        if not quote.property_name or not quote.base_price_per_night_cents:
            continue

        h = compute_content_hash(
            "lodging",
            "",
            destination_code,
            check_in,
            check_out,
            quote.base_price_per_night_cents,
            quote.source,
        )

        offer_id = str(uuid.uuid4())
        offer_stmt = text("""
            INSERT INTO lodging_offers (
                id, destination_code, city, provider, property_id, name,
                stars, review_score, review_count, latitude, longitude,
                check_in, check_out, adults, price_total_cents, currency,
                taxes_included, deep_link, observed_at, content_hash, is_live
            ) VALUES (
                :id, :destination_code, :city, :provider, :property_id, :name,
                :stars, :review_score, :review_count, :latitude, :longitude,
                :check_in, :check_out, 2, :price_total_cents, :currency,
                :taxes_included, :deep_link, :observed_at, :content_hash, :is_live
            ) ON CONFLICT (content_hash, observed_at) DO NOTHING
        """)
        await session.execute(
            offer_stmt,
            {
                "id": offer_id,
                "destination_code": destination_code,
                "city": destination_code,
                "provider": quote.source,
                "property_id": quote.property_id or offer_id,
                "name": quote.property_name,
                "stars": quote.stars,
                "review_score": quote.review_score,
                "review_count": quote.review_count,
                "latitude": quote.latitude,
                "longitude": quote.longitude,
                "check_in": check_in,
                "check_out": check_out,
                "price_total_cents": quote.base_price_per_night_cents * nights,
                "currency": quote.currency,
                "taxes_included": quote.taxes_included,
                "deep_link": quote.deep_link,
                "observed_at": now,
                "content_hash": h,
                "is_live": quote.is_live,
            },
        )

        tick_id = str(uuid.uuid4())
        stmt = text("""
            INSERT INTO market_price_ticks (
                id, observed_at, asset_type, origin_iata, destination_code,
                depart_date, return_date, nights, lead_time_days, currency, base_price_cents,
                stat, sample_n, quality_tier, source, source_class, is_aggregated, is_exploration,
                content_hash, ingest_run_id, metadata_json
            ) VALUES (
                :id, :observed_at, 'lodging', null, :destination_code,
                :depart_date, :return_date, :nights, :lead_time_days, :currency, :base_price_cents,
                'single', 1, null, :source, :source_class, false, false,
                :content_hash, :ingest_run_id, :metadata_json
            ) ON CONFLICT (content_hash, observed_at) DO NOTHING
        """)

        meta_json = json.dumps(
            {
                "lodging_offer_id": offer_id,
                "property_name": quote.property_name,
                "property_id": quote.property_id,
                "stars": quote.stars,
                "review_score": quote.review_score,
                "review_count": quote.review_count,
                "deep_link": quote.deep_link,
                "is_live": quote.is_live,
            }
        )

        await session.execute(
            stmt,
            {
                "id": tick_id,
                "observed_at": now,
                "destination_code": destination_code,
                "depart_date": check_in,
                "return_date": check_out,
                "nights": nights,
                "lead_time_days": lead_time,
                "currency": quote.currency,
                "base_price_cents": quote.base_price_per_night_cents,
                "source": quote.source,
                "source_class": "live" if quote.is_live else "derived",
                "content_hash": h,
                "ingest_run_id": ingest_run_id,
                "metadata_json": meta_json,
            },
        )

        daily_stmt = text("""
            INSERT INTO price_daily (
                bucket, asset_type, origin_iata, destination_code, depart_date,
                nights, source_class, source, currency, min_base, n_ticks
            ) VALUES (
                :bucket, 'lodging', '', :destination_code, :depart_date,
                :nights, :source_class, :source, :currency, :base_price_cents, 1
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
                "destination_code": destination_code,
                "depart_date": check_in,
                "nights": nights,
                "source_class": "live" if quote.is_live else "derived",
                "source": quote.source,
                "currency": quote.currency,
                "base_price_cents": quote.base_price_per_night_cents,
            },
        )
        ingested_count += 1

    await session.commit()
    return ingested_count


async def scan_and_ingest_watched_routes(session: AsyncSession) -> dict[str, int]:
    """
    Demand-driven scanning: queries active user alerts from deal_watch_alerts,
    finds unique (origin, destination) pairs and their date windows,
    and runs concurrent live ingestion.
    """
    query = select(DealWatchAlertModel).filter(DealWatchAlertModel.is_active.is_(True))
    res = await session.execute(query)
    alerts = res.scalars().all()

    if not alerts:
        logger.info("No active deal watch alerts to scan.")
        return {"flights_ingested": 0, "lodging_ingested": 0}

    # Demand union
    route_pairs: dict[tuple[str, str], tuple[date, date]] = {}
    for alert in alerts:
        orig = alert.origin_iata
        for dest in alert.destinations:
            key = (orig, dest)
            if key not in route_pairs:
                route_pairs[key] = (alert.earliest_date, alert.latest_date)
            else:
                cur_earliest, cur_latest = route_pairs[key]
                route_pairs[key] = (
                    min(cur_earliest, alert.earliest_date),
                    max(cur_latest, alert.latest_date),
                )

    flight_feed = CompositeFlightFeed()
    lodging_feed = OpenLodgingFeed()
    total_flights = 0
    total_lodging = 0
    ingest_run_id = str(uuid.uuid4())

    for (orig, dest), (date_from, date_to) in route_pairs.items():
        logger.info(
            f"[Demand Scan] Ingesting route {orig} -> {dest} for window {date_from}..{date_to}"
        )
        # Ingest flights
        fl_count = await ingest_flight_ticks(
            session=session,
            origin_iata=orig,
            dest_iata=dest,
            dest_code=dest,
            date_from=date_from,
            date_to=date_to,
            feed=flight_feed,
            ingest_run_id=ingest_run_id,
        )
        total_flights += fl_count

        # Ingest lodging sample for earliest date
        check_out = date_from + timedelta(days=4)
        lg_count = await ingest_lodging_ticks(
            session=session,
            destination_code=dest,
            check_in=date_from,
            check_out=check_out,
            feed=lodging_feed,
            ingest_run_id=ingest_run_id,
        )
        total_lodging += lg_count

    # Update last_scanned_at
    now = datetime.now(timezone.utc)
    for alert in alerts:
        alert.last_scanned_at = now
    await session.commit()

    return {"flights_ingested": total_flights, "lodging_ingested": total_lodging}
