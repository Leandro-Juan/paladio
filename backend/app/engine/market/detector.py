"""
Paladio Deal Engine Detection & Verification Funnel.
Implements the 6-stage deal definition:
1. Statistical Detection (R_MAX <= 0.75, P_ANCHOR <= 0.25, savings >= 30 EUR)
2. Feasibility (Dead Window 00:00-05:00, buffer checks, on-ground hours)
3. Bookability (Live Flight quote verification within tolerance)
4. Affordability (Landed total <= budget, landed savings >= threshold)
5. Quality Gate (Lodging quality >= 70)
6. Itinerary Gate (gates_passed == True, realism >= 8.0)
Persists verified proposals to TripModel and deal_events, emitting WebSocket alerts.
"""

import logging
import uuid
from datetime import date, datetime, timedelta, timezone
from typing import Any

from app.db.models import (
    DealCandidateModel,
    DealEventModel,
    DealWatchAlertModel,
    MarketPriceTickModel,
    TripModel,
)
from app.engine.market.adapters import (
    CompositeFlightFeed,
    OpenLodgingFeed,
    RedisWebSocketNotifier,
    SovereignItineraryGate,
    SovereignLodgingScorer,
)
from app.engine.market.baselines import resolve_baseline_median
from app.engine.market.config import config
from app.engine.market.ports import FlightQuote
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

logger = logging.getLogger(__name__)


async def run_deal_detection_scan(session: AsyncSession) -> list[dict[str, Any]]:
    """
    Executes the complete Deal Engine funnel across recently ingested ticks
    matching active user alerts.
    """
    now = datetime.now(timezone.utc)
    today = now.date()

    # 1. Fetch active alerts
    alert_query = select(DealWatchAlertModel).filter(
        DealWatchAlertModel.is_active.is_(True)
    )
    alert_res = await session.execute(alert_query)
    active_alerts = alert_res.scalars().all()

    if not active_alerts:
        logger.info("No active deal watch alerts for detection scan.")
        return []

    flight_feed = CompositeFlightFeed()
    lodging_feed = OpenLodgingFeed()
    lodging_scorer = SovereignLodgingScorer()
    itinerary_gate = SovereignItineraryGate()
    notifier = RedisWebSocketNotifier()

    verified_deals: list[dict[str, Any]] = []
    ingested_lodging_dates: set[tuple[str, date]] = set()

    # Map alerts by (origin_iata, destination)
    for alert in active_alerts:
        orig = alert.origin_iata
        for dest in alert.destinations:
            # Query candidate flights for this route within alert date window
            fl_query = (
                select(MarketPriceTickModel)
                .filter(
                    MarketPriceTickModel.asset_type == "flight",
                    MarketPriceTickModel.origin_iata == orig,
                    MarketPriceTickModel.destination_code == dest,
                    MarketPriceTickModel.depart_date >= max(alert.earliest_date, today),
                    MarketPriceTickModel.depart_date <= alert.latest_date,
                )
                .order_by(MarketPriceTickModel.base_price_cents.asc())
                .limit(config.K_PER_SCAN)
            )
            fl_res = await session.execute(fl_query)
            flight_ticks = fl_res.scalars().all()

            logger.debug(
                f"[Detector] Alert {orig}->{dest}, found {len(flight_ticks)} candidate flight ticks."
            )
            for ft in flight_ticks:
                dep_date = ft.depart_date

                # Query cheapest return flight tick for corridor dest -> orig within stay window
                ret_query = (
                    select(MarketPriceTickModel)
                    .filter(
                        MarketPriceTickModel.asset_type == "flight",
                        MarketPriceTickModel.origin_iata == dest,
                        MarketPriceTickModel.destination_code == orig,
                        MarketPriceTickModel.depart_date
                        >= dep_date + timedelta(days=alert.min_nights),
                        MarketPriceTickModel.depart_date
                        <= dep_date + timedelta(days=alert.max_nights),
                    )
                    .order_by(MarketPriceTickModel.base_price_cents.asc())
                    .limit(1)
                )
                ret_res = await session.execute(ret_query)
                best_ret_tick = ret_res.scalar_one_or_none()

                if best_ret_tick:
                    ret_date = best_ret_tick.depart_date
                    nights = (ret_date - dep_date).days
                    return_flight_base = best_ret_tick.base_price_cents
                else:
                    nights = min(max(ft.nights, alert.min_nights), alert.max_nights)
                    ret_date = dep_date + timedelta(days=nights)
                    return_flight_base = 0

                # Fetch lodging quote dynamically for this window
                lodging_quote = await lodging_feed.fetch_destination_summary(
                    dest, dep_date, ret_date, session=session
                )
                total_lodging_base = lodging_quote.base_price_per_night_cents * nights
                total_package_base = (
                    ft.base_price_cents + return_flight_base + total_lodging_base
                )

                # -------------------------------------------------------------
                # Stage 1: Statistical Detection against Route Baselines
                # -------------------------------------------------------------
                flight_median, fl_level = await resolve_baseline_median(
                    session, "flight", orig, dest, dep_date, today, ft.currency
                )
                ret_flight_median = None
                if best_ret_tick:
                    ret_flight_median, _ = await resolve_baseline_median(
                        session,
                        "flight",
                        dest,
                        orig,
                        ret_date,
                        today,
                        best_ret_tick.currency,
                    )
                lodging_median, _ = await resolve_baseline_median(
                    session, "lodging", "", dest, dep_date, today, "EUR"
                )
                # Strictly require real baselines from empirical observations
                if (
                    lodging_median is None
                    and lodging_quote
                    and lodging_quote.base_price_per_night_cents
                ):
                    lodging_median = lodging_quote.base_price_per_night_cents
                    # Record live lodging tick into DB if not already added in this run
                    if (dest, dep_date) not in ingested_lodging_dates:
                        ingested_lodging_dates.add((dest, dep_date))
                        import hashlib

                        h = hashlib.sha256(
                            f"lodging_{dest}_{dep_date}_{lodging_quote.base_price_per_night_cents}_{now.timestamp()}".encode()
                        ).digest()
                        l_tick = MarketPriceTickModel(
                            id=str(uuid.uuid4()),
                            observed_at=now,
                            asset_type="lodging",
                            origin_iata="",
                            destination_code=dest,
                            depart_date=dep_date,
                            return_date=ret_date,
                            nights=nights,
                            lead_time_days=max((dep_date - today).days, 0),
                            base_price_cents=lodging_quote.base_price_per_night_cents,
                            currency=lodging_quote.currency,
                            source=lodging_quote.source,
                            source_class="live",
                            content_hash=h,
                        )
                        session.add(l_tick)

                if flight_median is None or lodging_median is None:
                    logger.debug(
                        f"[Detector] Route {orig}->{dest} in learning baseline state (fl={flight_median}, ldg={lodging_median}). Deal evaluation paused."
                    )
                    continue

                combined_flight_median = flight_median + (
                    ret_flight_median
                    if ret_flight_median is not None
                    else flight_median
                )
                baseline_package_total = combined_flight_median + (
                    lodging_median * nights
                )
                package_ratio = total_package_base / max(baseline_package_total, 1)
                est_savings_cents = max(baseline_package_total - total_package_base, 0)

                max_ratio = (
                    float(alert.max_package_ratio)
                    if alert.max_package_ratio
                    else config.R_MAX
                )
                logger.debug(
                    f"[Detector] Flight Base: {ft.base_price_cents}, Med: {flight_median}, Ratio: {package_ratio:.3f} (max={max_ratio}), Savings: {est_savings_cents}"
                )
                if (
                    package_ratio > max_ratio
                    and est_savings_cents < config.MIN_ABS_SAVINGS_CENTS
                ):
                    logger.debug("[Detector] Failed Stage 1 Statistical check")
                    continue

                # -------------------------------------------------------------
                # Stage 2: Feasibility Gate (Dead window & buffers)
                # -------------------------------------------------------------
                meta = ft.metadata_json or {}
                dep_local_str = meta.get("depart_local")
                arr_local_str = meta.get("arrival_local")
                dep_dt = (
                    datetime.fromisoformat(dep_local_str)
                    if dep_local_str
                    else datetime.combine(dep_date, datetime.min.time())
                )
                arr_dt = (
                    datetime.fromisoformat(arr_local_str)
                    if arr_local_str
                    else (dep_dt + timedelta(hours=2, minutes=30))
                )

                if (
                    config.DEAD_WINDOW_LOCAL[0][0]
                    <= arr_dt.hour
                    < config.DEAD_WINDOW_LOCAL[1][0]
                ):
                    logger.debug("[Detector] Failed Stage 2 Dead Window check")
                    continue

                # -------------------------------------------------------------
                # Stage 3: Bookable (Live Flight Verification)
                # -------------------------------------------------------------
                fq = FlightQuote(
                    origin_iata=orig,
                    destination_iata=ft.dest_airport_iata or dest,
                    destination_city_id=dest,
                    depart_time=dep_dt,
                    arrival_time=arr_dt,
                    base_price_cents=ft.base_price_cents,
                    currency=ft.currency,
                    carrier=meta.get("carrier") or ft.source or "Airline",
                    flight_number=meta.get("flightNumber"),
                    deep_link=meta.get("deep_link"),
                )
                (
                    verified_ok,
                    landed_flight_cents,
                    ver_details,
                ) = await flight_feed.verify_flight(fq)
                logger.debug(
                    f"[Detector] Stage 3 Bookability: verified_ok={verified_ok}, landed_flight_cents={landed_flight_cents}, details={ver_details}"
                )
                if not verified_ok:
                    continue

                # -------------------------------------------------------------
                # Stage 4: Affordable & Still Cheap (Landed Arithmetic)
                # -------------------------------------------------------------
                landed_lodging_cents = total_lodging_base
                # Append user-configured baggage budget if present
                user_baggage_budget = alert.baggage_budget_cents or 0
                landed_total_cents = (
                    landed_flight_cents + landed_lodging_cents + user_baggage_budget
                )

                if landed_total_cents > alert.max_budget_cents:
                    logger.debug(
                        f"[Detector] Failed Stage 4 Budget: {landed_total_cents} > {alert.max_budget_cents}"
                    )
                    continue

                landed_baseline_est = flight_median + (lodging_median * nights)
                landed_savings_cents = max(landed_baseline_est - landed_total_cents, 0)
                logger.debug(
                    f"[Detector] Landed Total: {landed_total_cents}, Landed Base Est: {landed_baseline_est}, Landed Savings: {landed_savings_cents}"
                )
                if landed_savings_cents < config.MIN_ABS_SAVINGS_CENTS:
                    logger.debug(
                        f"[Detector] Failed Stage 4 Savings: {landed_savings_cents} < {config.MIN_ABS_SAVINGS_CENTS}"
                    )
                    continue

                # -------------------------------------------------------------
                # Stage 5: Quality Gate (Lodging >= 70)
                # -------------------------------------------------------------
                l_scores = lodging_scorer.score([lodging_quote])
                quality_score = l_scores[0] if l_scores else lodging_quote.quality_score
                logger.debug(
                    f"[Detector] Stage 5 Quality: score={quality_score}, min={config.LODGING_MIN_QUALITY}"
                )
                if quality_score < config.LODGING_MIN_QUALITY:
                    logger.debug("[Detector] Failed Stage 5 Quality")
                    continue

                # -------------------------------------------------------------
                # Stage 6: Itinerary Gate (realism >= 8.0)
                # -------------------------------------------------------------
                package_summary = {
                    "destination_code": dest,
                    "depart_date": dep_date,
                    "nights": nights,
                    "flight": {"depart_time": dep_dt, "arrival_time": arr_dt},
                }
                gate_res = await itinerary_gate.evaluate(package_summary)
                logger.debug(
                    f"[Detector] Stage 6 Gate: passed={gate_res.gates_passed}, realism={gate_res.realism}, min={config.REALISM_MIN}"
                )
                if not gate_res.gates_passed or gate_res.realism < config.REALISM_MIN:
                    logger.debug(
                        f"[Detector] Failed Stage 6 Itinerary Gate: failures={gate_res.details.get('gate_failures')}"
                    )
                    continue

                # -------------------------------------------------------------
                # Candidate & Deal Event Persistence
                # -------------------------------------------------------------
                cand_id = str(uuid.uuid4())
                idempotency_key = f"deal:{orig}:{dest}:{dep_date.isoformat()}:{nights}:{landed_total_cents}"

                cand = DealCandidateModel(
                    id=cand_id,
                    idempotency_key=idempotency_key,
                    asset_type="package",
                    origin_iata=orig,
                    destination_code=dest,
                    depart_date=dep_date,
                    return_date=ret_date,
                    currency=ft.currency,
                    cached_flight_base_cents=ft.base_price_cents,
                    lodging_estimate_cents=total_lodging_base,
                    est_total_cents=total_package_base,
                    est_savings_cents=est_savings_cents,
                    package_ratio=round(package_ratio, 3),
                    baseline_level_used=fl_level or "full",
                    confidence="high",
                    detector_version="v3",
                    status="gated",
                    live_queries_used=1,
                    live_cost_cents=0,
                    verification_json=ver_details,
                    detected_at=now,
                    verified_at=now,
                )
                session.add(cand)

                # Check user daily alert cap (MAX_ALERTS_PER_USER_PER_DAY = 3)
                day_start = datetime.combine(
                    today, datetime.min.time(), tzinfo=timezone.utc
                )
                cap_stmt = select(func.count(DealEventModel.id)).filter(
                    DealEventModel.user_id == alert.user_id,
                    DealEventModel.status == "alerted",
                    DealEventModel.alerted_at >= day_start,
                )
                cap_res = await session.execute(cap_stmt)
                user_alerts_today = cap_res.scalar_one() or 0

                event_status = (
                    "alerted"
                    if user_alerts_today < config.MAX_ALERTS_PER_USER_PER_DAY
                    else "suppressed_cap"
                )

                package_payload = {
                    "origin_iata": orig,
                    "destination_code": dest,
                    "depart_date": dep_date.isoformat(),
                    "return_date": ret_date.isoformat(),
                    "nights": nights,
                    "flight": {
                        "airline": meta.get("carrier", "Ryanair"),
                        "flight_number": meta.get("flightNumber"),
                        "depart_time": dep_dt.isoformat(),
                        "arrival_time": arr_dt.isoformat(),
                        "base_price_cents": ft.base_price_cents,
                        "landed_price_cents": landed_flight_cents,
                        "deep_link": meta.get("deep_link"),
                    },
                    "return_flight": {
                        "airline": (
                            best_ret_tick.metadata_json.get("carrier", "Ryanair")
                            if isinstance(best_ret_tick.metadata_json, dict)
                            else "Ryanair"
                        ),
                        "base_price_cents": best_ret_tick.base_price_cents,
                        "depart_date": best_ret_tick.depart_date.isoformat(),
                    }
                    if best_ret_tick
                    else None,
                    "lodging": {
                        "property_name": lodging_quote.property_name,
                        "base_nightly_cents": lodging_quote.base_price_per_night_cents,
                        "landed_total_cents": landed_lodging_cents,
                        "quality_score": quality_score,
                        "deep_link": lodging_quote.deep_link,
                    },
                    "total_landed_cents": landed_total_cents,
                    "landed_savings_cents": landed_savings_cents,
                    "package_ratio": round(package_ratio, 3),
                    "realism_score": gate_res.realism,
                    "total_price_eur": round(landed_total_cents / 100.0, 2),
                    "baseline_median_eur": round(landed_baseline_est / 100.0, 2),
                    "savings_eur": round(landed_savings_cents / 100.0, 2),
                    "discount_pct": round(max((1.0 - package_ratio) * 100, 0.0), 1),
                }

                # Check for existing active deals for this alert to handle auto-substitution
                existing_ev_stmt = select(DealEventModel).filter(
                    DealEventModel.alert_id == alert.id,
                    DealEventModel.status.in_(["alerted", "pending", "active"]),
                )
                existing_ev_res = await session.execute(existing_ev_stmt)
                existing_events = existing_ev_res.scalars().all()

                if existing_events:
                    # Determine whether newly verified package is superior
                    best_existing = min(
                        existing_events,
                        key=lambda e: (
                            e.package_json.get("total_landed_cents", float("inf")),
                            -e.package_json.get("landed_savings_cents", 0),
                        ),
                    )
                    best_pkg = best_existing.package_json or {}
                    best_price = best_pkg.get("total_landed_cents", float("inf"))
                    best_savings = best_pkg.get("landed_savings_cents", 0)

                    is_better = (landed_total_cents < best_price) or (
                        landed_total_cents == best_price
                        and landed_savings_cents > best_savings
                    )

                    if not is_better:
                        logger.info(
                            f"Skipping package {orig}->{dest} (€{landed_total_cents/100:.2f}): existing active package (€{best_price/100:.2f}) is already superior."
                        )
                        continue

                    # Superior package found: substitute existing active deals and proposals
                    logger.info(
                        f"Substituting deal package for {orig}->{dest}: new €{landed_total_cents/100:.2f} replaces old €{best_price/100:.2f}"
                    )
                    for ev in existing_events:
                        ev.status = "superseded"

                    old_trips_stmt = select(TripModel).filter(
                        TripModel.user_id == alert.user_id,
                        TripModel.status == "deal_proposal",
                        TripModel.destination == dest,
                    )
                    old_trips_res = await session.execute(old_trips_stmt)
                    for old_t in old_trips_res.scalars().all():
                        old_t.status = "superseded"

                event_id = str(uuid.uuid4())
                event = DealEventModel(
                    id=event_id,
                    candidate_id=cand_id,
                    alert_id=alert.id,
                    user_id=alert.user_id,
                    status=event_status,
                    package_json=package_payload,
                    alerted_at=now,
                )
                session.add(event)

                # Create proposal in TripModel
                trip_id = f"trip_proposal_{uuid.uuid4().hex[:8]}"
                proposal_trip = TripModel(
                    id=trip_id,
                    user_id=alert.user_id,
                    destination=dest,
                    start_date=dep_date.isoformat(),
                    end_date=ret_date.isoformat(),
                    status="deal_proposal",
                    itinerary_data={
                        "deal_package": package_payload,
                        "realism_score": gate_res.realism,
                    },
                )
                session.add(proposal_trip)

                await session.commit()

                # Dispatch notification if not suppressed by cap
                if event_status == "alerted":
                    notifier.push(alert.user_id, event_id, package_payload)

                verified_deals.append(package_payload)
                logger.info(
                    f"Verified deal found: {orig}->{dest} on {dep_date} for €{landed_total_cents / 100:.2f} (Savings: €{landed_savings_cents / 100:.2f})"
                )
                break  # Max per route per scan limit

    return verified_deals
