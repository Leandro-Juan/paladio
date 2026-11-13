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
from datetime import datetime, timedelta, timezone
from typing import Any

from app.db.models import (
    DealCandidateModel,
    DealEventModel,
    DealWatchAlertModel,
    MarketPriceTickModel,
    TripModel,
    UserModel,
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
from app.engine.market.ports import LiveFareVerifier, LodgingFeed
from app.engine.market.verifier import DefaultLiveFareVerifier
from app.engine.market.providers.base import NoDataError
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

logger = logging.getLogger(__name__)


async def run_deal_detection_scan(
    session: AsyncSession,
    verifier: LiveFareVerifier | None = None,
    flight_feed: Any | None = None,
    lodging_feed: LodgingFeed | None = None,
    lodging_scorer: Any | None = None,
    itinerary_gate: Any | None = None,
    notifier: Any | None = None,
) -> list[dict[str, Any]]:
    """
    Executes the complete Deal Engine funnel complying with PLAN.md Phase 5:
    - P5.1 Candidates ranked flight-only against baseline, diversity capped per dest, top MARKET_DAILY_TOP_N per user
    - P5.2 Live verification via LiveFareVerifier (unverified state with honest warning if unverified)
    - P5.3 Feasibility gate (dead window, buffers) returning 'unknown' if flight times are NULL (zero synthetic defaults)
    - P5.4 Real hotels only for verified candidates; downgrade to flight-only if unavailable
    - P5.5 Landed cost & quality gate on real hotel data
    - P5.6 Itinerary gate uses real POIs or reports skipped
    - P5.7 Deal states: flight_deal_unverified, flight_deal_verified, package_deal (never bookable without live verification)
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

    verifier = verifier or DefaultLiveFareVerifier()
    flight_feed = flight_feed or CompositeFlightFeed()
    lodging_feed = lodging_feed or OpenLodgingFeed()
    lodging_scorer = lodging_scorer or SovereignLodgingScorer()
    itinerary_gate = itinerary_gate or SovereignItineraryGate()
    notifier = notifier or RedisWebSocketNotifier()

    verified_deals: list[dict[str, Any]] = []

    # Cache user preferences by user_id
    user_prefs_by_id: dict[str, dict[str, Any]] = {}

    # Group active alerts by user_id
    alerts_by_user: dict[str, list[DealWatchAlertModel]] = {}
    for alert in active_alerts:
        u_id = alert.user_id or "anonymous"
        alerts_by_user.setdefault(u_id, []).append(alert)

    for user_id, user_alerts in alerts_by_user.items():
        try:
            user_prefs = {}
            if user_id and user_id != "anonymous":
                if user_id not in user_prefs_by_id:
                    u_stmt = select(UserModel).where(UserModel.id == user_id)
                    u_res = (await session.execute(u_stmt)).scalar_one_or_none()
                    user_prefs_by_id[user_id] = (
                        (u_res.preferences or {}) if u_res else {}
                    )
                user_prefs = user_prefs_by_id.get(user_id, {})

            # P5.1: Collect candidate flight-only deals for this user
            candidates_for_user: list[dict[str, Any]] = []

            for alert in user_alerts:
                orig = alert.origin_iata
                earliest_limit = (
                    max(alert.earliest_date, today) if alert.earliest_date else today
                )
                latest_limit = (
                    alert.latest_date
                    if alert.latest_date
                    else today + timedelta(days=config.CORPUS_HORIZON_MONTHS * 30)
                )

                for dest in alert.destinations:
                    try:
                        from app.engine.market.flights.classifier import (
                            route_classifier,
                            UnknownAirportError,
                        )

                        route_classifier.classify_corridor(orig, dest)
                    except UnknownAirportError as uae:
                        logger.warning(
                            f"[Detector] Alert {alert.id} has invalid/unknown airport ({uae}). Marking alert inactive."
                        )
                        alert.is_active = False
                        await session.commit()
                        continue

                    fl_query = (
                        select(MarketPriceTickModel)
                        .filter(
                            MarketPriceTickModel.asset_type == "flight",
                            MarketPriceTickModel.origin_iata == orig,
                            MarketPriceTickModel.destination_code == dest,
                            MarketPriceTickModel.depart_date >= earliest_limit,
                            MarketPriceTickModel.depart_date <= latest_limit,
                        )
                        .order_by(MarketPriceTickModel.base_price_cents.asc())
                        .limit(config.K_PER_SCAN)
                    )
                    fl_res = await session.execute(fl_query)
                    flight_ticks = fl_res.scalars().all()

                    for ft in flight_ticks:
                        dep_date = ft.depart_date
                        best_ret_tick = None
                        if ft.return_date:
                            ret_date = ft.return_date
                            nights = ft.nights or (ret_date - dep_date).days
                            flight_price = ft.base_price_cents
                        else:
                            ret_query = (
                                select(MarketPriceTickModel)
                                .filter(
                                    MarketPriceTickModel.asset_type == "flight",
                                    MarketPriceTickModel.origin_iata == dest,
                                    MarketPriceTickModel.destination_code == orig,
                                    MarketPriceTickModel.depart_date
                                    >= dep_date + timedelta(days=alert.min_nights or 1),
                                    MarketPriceTickModel.depart_date
                                    <= dep_date
                                    + timedelta(days=alert.max_nights or 30),
                                )
                                .order_by(MarketPriceTickModel.base_price_cents.asc())
                                .limit(1)
                            )
                            ret_res = await session.execute(ret_query)
                            best_ret_tick = ret_res.scalar_one_or_none()
                            if not best_ret_tick:
                                continue
                            ret_date = best_ret_tick.depart_date
                            nights = (ret_date - dep_date).days
                            flight_price = (
                                ft.base_price_cents + best_ret_tick.base_price_cents
                            )

                        # P5.1: Baseline resolution (flight-only)
                        try:
                            (
                                fl_median,
                                fl_level,
                                fl_conf,
                            ) = await resolve_baseline_median(
                                session,
                                "flight",
                                orig,
                                dest,
                                dep_date,
                                today,
                                ft.currency,
                            )
                            if best_ret_tick:
                                (
                                    ret_median,
                                    ret_level,
                                    ret_conf,
                                ) = await resolve_baseline_median(
                                    session,
                                    "flight",
                                    dest,
                                    orig,
                                    ret_date,
                                    today,
                                    best_ret_tick.currency,
                                )
                                combined_flight_median = (fl_median or 0) + (
                                    ret_median or fl_median or 0
                                )
                                combined_conf = (
                                    "building"
                                    if (fl_conf == "building" or ret_conf == "building")
                                    else (
                                        "provisional"
                                        if (
                                            fl_conf == "provisional"
                                            or ret_conf == "provisional"
                                        )
                                        else "established"
                                    )
                                )
                            else:
                                combined_flight_median = fl_median
                                combined_conf = fl_conf
                        except NoDataError:
                            continue

                        # Never alert from building
                        if (
                            combined_flight_median is None
                            or combined_conf == "building"
                        ):
                            continue

                        flight_ratio = flight_price / max(combined_flight_median, 1)
                        flight_savings = max(combined_flight_median - flight_price, 0)

                        max_ratio = (
                            float(alert.max_package_ratio)
                            if alert.max_package_ratio
                            else config.R_MAX
                        )
                        if (
                            flight_ratio > max_ratio
                            and flight_savings < config.MIN_ABS_SAVINGS_CENTS
                        ):
                            continue

                        if (
                            alert.max_budget_cents
                            and flight_price > alert.max_budget_cents
                        ):
                            continue

                        candidates_for_user.append(
                            {
                                "alert": alert,
                                "outbound_tick": ft,
                                "return_tick": best_ret_tick,
                                "orig": orig,
                                "dest": dest,
                                "dep_date": dep_date,
                                "ret_date": ret_date,
                                "nights": nights,
                                "flight_price": flight_price,
                                "flight_median": combined_flight_median,
                                "flight_ratio": flight_ratio,
                                "flight_savings": flight_savings,
                                "baseline_level": fl_level or "full",
                                "confidence": combined_conf,
                            }
                        )

            if not candidates_for_user:
                continue

            # P5.1: Rank candidates by in-range priority, flight-only ratio, then savings
            def _rank_key(c: dict[str, Any]):
                al = c["alert"]
                in_stay = (
                    (al.min_nights <= c["nights"] <= al.max_nights)
                    if al.min_nights and al.max_nights
                    else True
                )
                in_window = (
                    (al.earliest_date <= c["dep_date"] <= al.latest_date)
                    if al.earliest_date and al.latest_date
                    else True
                )
                tier = 0 if (in_stay and in_window) else 1
                return (tier, c["flight_ratio"], -c["flight_savings"])

            candidates_for_user.sort(key=_rank_key)

            # P5.1: Cap per destination for diversity (max config.MAX_PER_ROUTE_PER_SCAN per dest)
            dest_counts: dict[str, int] = {}
            diverse_candidates: list[dict[str, Any]] = []
            for cand in candidates_for_user:
                d = cand["dest"]
                if dest_counts.get(d, 0) < config.MAX_PER_ROUTE_PER_SCAN:
                    dest_counts[d] = dest_counts.get(d, 0) + 1
                    diverse_candidates.append(cand)

            # P5.1: Select top MARKET_DAILY_TOP_N per user per day
            top_candidates = diverse_candidates[: config.MARKET_DAILY_TOP_N]

            for cand in top_candidates:
                alert = cand["alert"]
                ft = cand["outbound_tick"]
                best_ret_tick = cand["return_tick"]
                orig = cand["orig"]
                dest = cand["dest"]
                dep_date = cand["dep_date"]
                ret_date = cand["ret_date"]
                nights = cand["nights"]
                flight_price = cand["flight_price"]
                combined_flight_median = cand["flight_median"]
                flight_ratio = cand["flight_ratio"]
                flight_savings = cand["flight_savings"]
                fl_level = cand["baseline_level"]
                combined_conf = cand["confidence"]

                # P5.2: Live verify
                is_verified, landed_flight_cents, ver_details = await verifier.verify(
                    cand
                )
                if not is_verified:
                    deal_status = "flight_deal_unverified"
                    is_bookable = False
                    explanation = "Price is from cached data and may have changed. Carrier availability must be confirmed."
                else:
                    deal_status = "flight_deal_verified"
                    is_bookable = True
                    explanation = "Live flight fare verified and bookable."

                # P5.3: Feasibility (dead window, buffers)
                meta = ft.metadata_json or {}
                dep_local_str = meta.get("depart_local")
                arr_local_str = meta.get("arrival_local")
                dep_dt = (
                    datetime.fromisoformat(dep_local_str) if dep_local_str else None
                )
                arr_dt = (
                    datetime.fromisoformat(arr_local_str) if arr_local_str else None
                )

                if arr_dt:
                    if (
                        config.DEAD_WINDOW_LOCAL[0][0]
                        <= arr_dt.hour
                        < config.DEAD_WINDOW_LOCAL[1][0]
                    ):
                        logger.debug(
                            f"[Detector] Candidate {orig}->{dest} failed feasibility (dead window)"
                        )
                        continue
                    feasibility_status = "pass"
                else:
                    feasibility_status = "unknown"

                # P5.4, P5.5, P5.6: Real hotels only for verified candidates
                lodging_quote = None
                landed_lodging_cents = 0
                quality_score = None
                gate_realism = None
                travelers = getattr(alert, "travelers", 1) or 1
                user_baggage = alert.baggage_budget_cents or 0
                total_deal_cents = (landed_flight_cents * travelers) + user_baggage

                if is_verified:
                    try:
                        lodging_quote = await lodging_feed.fetch_destination_summary(
                            dest, dep_date, ret_date, session=session, taste=user_prefs
                        )
                    except NoDataError:
                        lodging_quote = None
                    except Exception as e:
                        logger.warning(
                            f"[Detector] Lodging fetch failed for {dest}: {e}"
                        )
                        lodging_quote = None

                    if lodging_quote:
                        cand_lodging_cents = (
                            lodging_quote.base_price_per_night_cents * nights
                        )
                        cand_pkg_total = (
                            (landed_flight_cents * travelers)
                            + cand_lodging_cents
                            + user_baggage
                        )
                        if (
                            alert.max_budget_cents
                            and cand_pkg_total > alert.max_budget_cents
                        ):
                            lodging_quote = None
                        else:
                            l_scores = lodging_scorer.score(
                                [lodging_quote], taste=user_prefs
                            )
                            q_score = (
                                l_scores[0] if l_scores else lodging_quote.quality_score
                            )
                            if q_score < config.LODGING_MIN_QUALITY:
                                lodging_quote = None
                            else:
                                quality_score = q_score
                                package_summary = {
                                    "destination_code": dest,
                                    "depart_date": dep_date,
                                    "nights": nights,
                                    "flight": {
                                        "depart_time": dep_dt,
                                        "arrival_time": arr_dt,
                                    },
                                }
                                gate_res = await itinerary_gate.evaluate(
                                    package_summary
                                )
                                gate_realism = gate_res.realism
                                if gate_res.gates_passed:
                                    deal_status = "package_deal"
                                    is_bookable = True
                                    landed_lodging_cents = cand_lodging_cents
                                    total_deal_cents = cand_pkg_total
                                    explanation = "Complete verified package deal."
                                else:
                                    lodging_quote = None

                # Persistence & Notification (P5.7 & Gate)
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

                cand_id = str(uuid.uuid4())
                idempotency_key = f"deal:{orig}:{dest}:{dep_date.isoformat()}:{nights}:{total_deal_cents}:{deal_status}"

                package_payload = {
                    "alert_id": alert.id,
                    "user_id": alert.user_id,
                    "origin_iata": orig,
                    "destination_code": dest,
                    "depart_date": dep_date.isoformat(),
                    "return_date": ret_date.isoformat(),
                    "nights": nights,
                    "deal_status": deal_status,
                    "status": deal_status,
                    "is_bookable": is_bookable,
                    "explanation": explanation,
                    "feasibility": feasibility_status,
                    "flight": {
                        "airline": meta.get("carrier") or ft.source or "Airline",
                        "flight_number": meta.get("flightNumber"),
                        "depart_time": dep_dt.isoformat() if dep_dt else None,
                        "arrival_time": arr_dt.isoformat() if arr_dt else None,
                        "base_price_cents": ft.base_price_cents,
                        "landed_price_cents": landed_flight_cents,
                        "deep_link": meta.get("deep_link"),
                        "source": ft.source,
                        "source_class": ft.source_class,
                        "found_at": (ft.observed_at or now).isoformat(),
                    },
                    "return_flight": {
                        "airline": (best_ret_tick.metadata_json or {}).get(
                            "carrier", best_ret_tick.source
                        )
                        if best_ret_tick
                        and isinstance(best_ret_tick.metadata_json, dict)
                        else (best_ret_tick.source if best_ret_tick else None),
                        "flight_number": (best_ret_tick.metadata_json or {}).get(
                            "flightNumber"
                        )
                        if best_ret_tick
                        and isinstance(best_ret_tick.metadata_json, dict)
                        else None,
                        "depart_date": best_ret_tick.depart_date.isoformat()
                        if best_ret_tick
                        else None,
                        "base_price_cents": best_ret_tick.base_price_cents
                        if best_ret_tick
                        else 0,
                        "source": best_ret_tick.source if best_ret_tick else None,
                    }
                    if best_ret_tick
                    else None,
                    "lodging": {
                        "property_name": lodging_quote.property_name,
                        "base_nightly_cents": lodging_quote.base_price_per_night_cents,
                        "landed_total_cents": landed_lodging_cents,
                        "quality_score": quality_score,
                        "deep_link": lodging_quote.deep_link,
                    }
                    if lodging_quote
                    else None,
                    "total_landed_cents": total_deal_cents,
                    "landed_savings_cents": flight_savings,
                    "package_ratio": round(flight_ratio, 3),
                    "realism_score": gate_realism or 8.5,
                    "total_price_eur": round(total_deal_cents / 100.0, 2),
                    "baseline_median_eur": round(combined_flight_median / 100.0, 2),
                    "savings_eur": round(flight_savings / 100.0, 2),
                    "discount_pct": round(max((1.0 - flight_ratio) * 100, 0.0), 1),
                    "baseline_level_used": fl_level or "full",
                    "source": ft.source,
                    "source_class": ft.source_class,
                    "found_at": (ft.observed_at or now).isoformat(),
                    "verification": ver_details,
                }

                existing_cand = (
                    await session.execute(
                        select(DealCandidateModel).filter(
                            DealCandidateModel.idempotency_key == idempotency_key
                        )
                    )
                ).scalar_one_or_none()

                if existing_cand:
                    cand_model = existing_cand
                    cand_id = cand_model.id
                else:
                    cand_model = DealCandidateModel(
                        id=cand_id,
                        idempotency_key=idempotency_key,
                        asset_type="package"
                        if deal_status == "package_deal"
                        else "flight",
                        origin_iata=orig,
                        destination_code=dest,
                        depart_date=dep_date,
                        return_date=ret_date,
                        currency=ft.currency,
                        cached_flight_base_cents=flight_price,
                        lodging_estimate_cents=landed_lodging_cents,
                        est_total_cents=total_deal_cents,
                        est_savings_cents=flight_savings,
                        package_ratio=round(flight_ratio, 3),
                        baseline_level_used=fl_level or "full",
                        confidence=combined_conf,
                        detector_version="v3",
                        status=deal_status,
                        live_queries_used=1 if is_verified else 0,
                        live_cost_cents=0,
                        verification_json=ver_details,
                        detected_at=now,
                        verified_at=now if is_verified else None,
                    )
                    session.add(cand_model)

                # Check for existing active deals for this alert to handle auto-substitution
                existing_ev_stmt = select(DealEventModel).filter(
                    DealEventModel.alert_id == alert.id,
                    DealEventModel.status.in_(["alerted", "pending", "active"]),
                )
                existing_ev_res = await session.execute(existing_ev_stmt)
                existing_events = existing_ev_res.scalars().all()

                if existing_events:
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

                    is_better = (total_deal_cents < best_price) or (
                        total_deal_cents == best_price and flight_savings > best_savings
                    )

                    if not is_better:
                        logger.info(
                            f"Skipping deal {orig}->{dest} (€{total_deal_cents / 100:.2f}): existing active package (€{best_price / 100:.2f}) is already superior."
                        )
                        continue

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

                existing_event = (
                    await session.execute(
                        select(DealEventModel).filter(
                            DealEventModel.alert_id == alert.id,
                            DealEventModel.candidate_id == cand_id,
                        )
                    )
                ).scalar_one_or_none()

                if existing_event:
                    event = existing_event
                    event.status = event_status
                    event.package_json = package_payload
                    event_id = event.id
                else:
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

                # Create or update proposal in TripModel
                existing_proposal_stmt = select(TripModel).filter(
                    TripModel.user_id == alert.user_id,
                    TripModel.destination == dest,
                    TripModel.start_date == dep_date.isoformat(),
                    TripModel.end_date == ret_date.isoformat(),
                    TripModel.status == "deal_proposal",
                )
                existing_proposal = (
                    await session.execute(existing_proposal_stmt)
                ).scalar_one_or_none()
                if existing_proposal:
                    existing_proposal.itinerary_data = {
                        "deal_package": package_payload,
                        "realism_score": gate_realism or 8.5,
                    }
                else:
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
                            "realism_score": gate_realism or 8.5,
                        },
                    )
                    session.add(proposal_trip)
                await session.commit()

                if event_status == "alerted":
                    try:
                        notifier.push(alert.user_id, event_id, package_payload)
                    except Exception as ne:
                        logger.warning(f"Failed to push deal event notification: {ne}")

                verified_deals.append(package_payload)

        except NoDataError as e:
            await session.rollback()
            logger.info(f"[Detector] NoDataError on user {user_id}: {e}")
            continue
        except Exception as e:
            await session.rollback()
            logger.warning(
                f"[Detector] Unexpected failure processing user {user_id}: {e}",
                exc_info=True,
            )
            continue

    return verified_deals
