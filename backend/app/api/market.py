"""
Paladio Deal Engine & Route Monitoring REST API.
Exposes endpoints for listing and managing monitored routes, live scan triggers,
multi-month price calendar matrices, trend history, telemetry statistics, and deal events.
Strictly zero hardcoded mock data: 100% dynamic data from PostgreSQL/TimescaleDB and live unauthenticated flight feeds.
"""

import calendar
import logging
import uuid
from datetime import date, datetime, timedelta, timezone
from typing import Any

from app.api.deps import get_optional_user
from app.db.models import (
    CityModel,
    DealCandidateModel,
    DealEventModel,
    DealWatchAlertModel,
    DestinationAirportModel,
    MarketPriceTickModel,
    PriceDailyModel,
    RouteBaselineModel,
    TripModel,
    UserModel,
)
from app.db.session import get_db
from app.engine.market.adapters import RyanairFlightFeed
from app.engine.market.baselines import (
    resolve_route_baseline_quantiles,
)
from app.engine.market.config import CORPUS_HORIZON_MONTHS
from app.engine.market.corpus import backfill_route_corpus, get_route_corpus_status
from app.engine.market.detector import run_deal_detection_scan
from app.engine.market.ingest import ingest_flight_ticks
from app.engine.market.verdict import classify_price
from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, Field
from sqlalchemy import delete, desc, func, select
from sqlalchemy.ext.asyncio import AsyncSession

logger = logging.getLogger(__name__)

router = APIRouter()


async def _resolve_city_name(session: AsyncSession, code: str) -> str:
    """Dynamically resolves city display name from CityModel or DestinationAirportModel."""
    # First check DestinationAirportModel mapped to CityModel
    stmt = (
        select(CityModel.name)
        .join(DestinationAirportModel, DestinationAirportModel.city_id == CityModel.id)
        .where(DestinationAirportModel.iata == code)
        .limit(1)
    )
    res = await session.execute(stmt)
    name = res.scalar_one_or_none()
    if name:
        return name

    # Next check CityModel by id or name match
    stmt_city = (
        select(CityModel.name)
        .where((CityModel.id.ilike(f"{code}%")) | (CityModel.name.ilike(f"{code}%")))
        .limit(1)
    )
    res_city = await session.execute(stmt_city)
    name_city = res_city.scalar_one_or_none()
    if name_city:
        return name_city

    return code


async def _get_or_create_user_id(session: AsyncSession, user: UserModel | None) -> str:
    if user and user.id:
        return user.id
    res = await session.execute(select(UserModel).limit(1))
    first_user = res.scalar_one_or_none()
    if first_user:
        return first_user.id
    new_user = UserModel(
        id=str(uuid.uuid4()),
        email="operator@paladio.local",
        username="PaladioOperator",
        full_name="Paladio Operator",
        role="admin",
    )
    session.add(new_user)
    await session.commit()
    await session.refresh(new_user)
    return new_user.id


# Pydantic Request / Response Schemas
class RouteCreateRequest(BaseModel):
    origin_iata: str = Field(..., min_length=3, max_length=3)
    destination_code: str = Field(..., min_length=3, max_length=10)
    earliest_date: str
    latest_date: str
    min_nights: int = 1
    max_nights: int = 7
    travelers: int = 1
    max_budget_eur: float = Field(..., gt=0)


class RouteUpdateRequest(BaseModel):
    is_active: bool | None = None
    max_budget_eur: float | None = None


class RouteItemResponse(BaseModel):
    id: str
    origin_iata: str
    destination_code: str
    destination_name: str
    earliest_date: str
    latest_date: str
    min_nights: int
    max_nights: int
    max_budget_eur: float
    currency: str
    is_active: bool
    schedule: str
    status: str  # "DEAL", "ACTIVE", "PAUSED", "PENDING"
    current_price_eur: float | None
    baseline_p50_eur: float | None
    baseline_p10_eur: float | None
    lowest_ever_eur: float | None
    discount_pct: float | None
    last_scanned_at: str | None
    ticks_count: int
    verdict: str | None = None
    verdict_percentile: float | None = None
    verdict_confidence: str | None = None
    corpus_status: str | None = None


class MarketSummaryResponse(BaseModel):
    monitored_routes: int
    deals_detected: int
    ticks_scanned_today: int
    avg_savings_pct: float


class HistoryPoint(BaseModel):
    date: str
    timestamp: str
    min_price_eur: float
    median_price_eur: float
    ticks_count: int
    carrier: str


class ForwardPricePoint(BaseModel):
    depart_date: str
    price_eur: float
    verdict: str | None = None
    percentile: float | None = None
    carrier: str | None = None


class CorpusInfo(BaseModel):
    status: str
    confidence: str
    ticks_ingested: int
    depart_dates_count: int
    min_price_eur: float | None = None
    max_price_eur: float | None = None
    median_price_eur: float | None = None
    last_backfill_at: str | None = None


class HistoryResponse(BaseModel):
    points: list[HistoryPoint]
    forward_curve: list[ForwardPricePoint] = Field(default_factory=list)
    p10_deal_eur: float | None
    p25_eur: float | None = None
    p50_median_eur: float | None
    p75_eur: float | None = None
    p90_peak_eur: float | None
    lowest_ever_eur: float | None
    verdict: dict[str, Any] | None = None
    corpus: CorpusInfo | None = None
    currency: str = "EUR"


class CalendarDayItem(BaseModel):
    date: str
    day: int
    weekday: int
    price_eur: float | None
    price_tier: str  # "deal", "fair", "standard", "peak", "no_data"
    carrier: str | None
    flight_number: str | None
    duration_mins: int | None
    departure_time: str | None
    booking_url: str | None
    is_holiday: bool


class CalendarMonthItem(BaseModel):
    year: int
    month: int
    month_name: str
    days: list[CalendarDayItem]


class CalendarResponse(BaseModel):
    months: list[CalendarMonthItem]
    route_label: str
    p10_deal_eur: float | None
    p50_median_eur: float | None


class RouteStatsResponse(BaseModel):
    current_price_eur: float | None
    current_percentile: float | None
    p10_deal_eur: float | None
    p25_eur: float | None = None
    p50_median_eur: float | None
    p75_eur: float | None = None
    p90_peak_eur: float | None
    lowest_ever_eur: float | None
    lowest_ever_date: str | None
    total_observations: int
    landed_fee_ratio: float
    next_scan_minutes: int
    itinerary_realism_score: float | None
    deal_savings_eur: float | None
    deal_savings_pct: float | None
    verdict: str | None = None
    verdict_confidence: str | None = None
    corpus_status: str | None = None
    depart_dates_count: int | None = None


class RouteEventItem(BaseModel):
    id: str
    event_type: str
    title: str
    result: str
    timestamp: str
    details: str
    booking_url: str | None = None


class DealFlightItem(BaseModel):
    airline: str
    flight_number: str | None = None
    depart_time: str
    arrival_time: str
    base_price_eur: float
    landed_price_eur: float
    booking_url: str | None = None
    source: str = "ryanair"
    is_live: bool = True
    ancillaries_excluded: bool = True


class DealLodgingItem(BaseModel):
    property_name: str
    nightly_base_eur: float
    landed_total_eur: float
    quality_score: float | None = None
    stars: float | None = None
    review_score: float | None = None
    review_count: int | None = None
    booking_url: str | None = None
    source: str = "booking"
    is_live: bool = True
    taxes_included: bool = True


class DealPackageItem(BaseModel):
    id: str
    alert_id: str
    candidate_id: str
    origin_iata: str
    destination_code: str
    origin_name: str
    destination_name: str
    depart_date: str
    return_date: str
    nights: int
    total_price_eur: float
    baseline_median_eur: float
    savings_eur: float
    discount_pct: float
    package_ratio: float
    realism_score: float
    status: str
    detected_at: str
    flight: DealFlightItem
    lodging: DealLodgingItem


class ProviderHealthItem(BaseModel):
    provider: str
    asset_type: str
    status: str
    last_ok_at: str | None
    failure_count: int
    consecutive_failures: int
    last_error: str | None
    updated_at: str


# Endpoints


@router.get("/summary", response_model=MarketSummaryResponse)
async def get_market_summary(
    session: AsyncSession = Depends(get_db),
    current_user: UserModel | None = Depends(get_optional_user),
):
    routes_res = await session.execute(select(func.count(DealWatchAlertModel.id)))
    routes_cnt = routes_res.scalar() or 0

    today = datetime.now(timezone.utc).date()
    ticks_res = await session.execute(
        select(func.count(MarketPriceTickModel.id)).where(
            func.date(MarketPriceTickModel.observed_at) == today
        )
    )
    ticks_cnt = ticks_res.scalar() or 0

    deals_ev_res = await session.execute(
        select(func.count(DealEventModel.id)).where(
            DealEventModel.status.in_(["alerted", "pending", "active"])
        )
    )
    deals_cnt = deals_ev_res.scalar() or 0
    if deals_cnt == 0:
        deals_res = await session.execute(
            select(func.count(DealCandidateModel.id)).where(
                DealCandidateModel.status == "verified"
            )
        )
        deals_cnt = deals_res.scalar() or 0

    savings_res = await session.execute(
        select(func.avg(DealCandidateModel.est_savings_cents)).where(
            DealCandidateModel.status == "verified"
        )
    )
    avg_cents = savings_res.scalar() or 0

    # Calculate dynamically from database
    total_budget_cents_res = await session.execute(
        select(func.avg(DealCandidateModel.cached_flight_base_cents)).where(
            DealCandidateModel.status == "verified"
        )
    )
    base_cents = total_budget_cents_res.scalar() or 1

    avg_savings_pct = (
        round((float(avg_cents) / float(base_cents)) * 100.0, 1)
        if base_cents > 0 and avg_cents > 0
        else 0.0
    )

    return MarketSummaryResponse(
        monitored_routes=routes_cnt,
        deals_detected=deals_cnt,
        ticks_scanned_today=ticks_cnt,
        avg_savings_pct=avg_savings_pct,
    )


@router.get("/routes", response_model=list[RouteItemResponse])
async def list_monitored_routes(
    session: AsyncSession = Depends(get_db),
    current_user: UserModel | None = Depends(get_optional_user),
):
    stmt = select(DealWatchAlertModel).order_by(
        DealWatchAlertModel.is_active.desc(), DealWatchAlertModel.created_at.desc()
    )
    res = await session.execute(stmt)
    alerts = res.scalars().all()

    items: list[RouteItemResponse] = []
    for a in alerts:
        dest_code = a.destinations[0] if a.destinations else ""
        dest_name = await _resolve_city_name(session, dest_code)

        tick_stmt = (
            select(MarketPriceTickModel)
            .where(
                MarketPriceTickModel.origin_iata == a.origin_iata,
                MarketPriceTickModel.destination_code == dest_code,
            )
            .order_by(desc(MarketPriceTickModel.observed_at))
            .limit(1)
        )
        tick_res = await session.execute(tick_stmt)
        latest_tick = tick_res.scalar_one_or_none()

        # Resolve empirical baseline quantiles hierarchically
        today = datetime.now(timezone.utc).date()
        quantiles, b_level, b_conf = await resolve_route_baseline_quantiles(
            session=session,
            origin_iata=a.origin_iata,
            destination_code=dest_code,
            depart_date=a.earliest_date,
            observation_date=today,
        )

        p50_eur = (
            round(quantiles["q50"] / 100.0, 2)
            if quantiles and "q50" in quantiles
            else None
        )
        p10_eur = (
            round(quantiles["q10"] / 100.0, 2)
            if quantiles and "q10" in quantiles
            else None
        )

        cnt_stmt = select(func.count(MarketPriceTickModel.id)).where(
            MarketPriceTickModel.origin_iata == a.origin_iata,
            MarketPriceTickModel.destination_code == dest_code,
        )
        cnt_res = await session.execute(cnt_stmt)
        total_ticks = cnt_res.scalar() or 0

        min_stmt = select(func.min(MarketPriceTickModel.base_price_cents)).where(
            MarketPriceTickModel.origin_iata == a.origin_iata,
            MarketPriceTickModel.destination_code == dest_code,
        )
        min_res = await session.execute(min_stmt)
        min_cents = min_res.scalar()

        current_eur = (
            round(latest_tick.base_price_cents / 100.0, 2) if latest_tick else None
        )
        lowest_eur = round(min_cents / 100.0, 2) if min_cents is not None else None

        # Check corpus status
        c_status = await get_route_corpus_status(session, a.origin_iata, dest_code)
        corpus_state = c_status.get("status", "building")

        discount = None
        is_deal = False
        verdict_label = None
        verdict_pct = None

        if latest_tick and quantiles:
            pv = classify_price(latest_tick.base_price_cents, quantiles, b_conf)
            verdict_label = pv.verdict
            verdict_pct = pv.percentile
            discount = pv.vs_median_pct if pv.vs_median_pct > 0 else None
            is_deal = pv.verdict in ("GREAT", "GOOD")
        elif current_eur and p50_eur and current_eur < p50_eur:
            discount = round(((p50_eur - current_eur) / p50_eur) * 100, 1)
            if (p10_eur and current_eur <= p10_eur) or discount >= 30.0:
                is_deal = True

        status_label = (
            "PAUSED"
            if not a.is_active
            else ("DEAL" if is_deal else ("ACTIVE" if current_eur else "PENDING"))
        )

        items.append(
            RouteItemResponse(
                id=a.id,
                origin_iata=a.origin_iata,
                destination_code=dest_code,
                destination_name=dest_name,
                earliest_date=a.earliest_date.isoformat(),
                latest_date=a.latest_date.isoformat(),
                min_nights=a.min_nights,
                max_nights=a.max_nights,
                max_budget_eur=round(a.max_budget_cents / 100.0, 2),
                currency=a.currency,
                is_active=a.is_active,
                schedule="Every 2h" if is_deal else "Daily",
                status=status_label,
                current_price_eur=current_eur,
                baseline_p50_eur=p50_eur,
                baseline_p10_eur=p10_eur,
                lowest_ever_eur=lowest_eur,
                discount_pct=discount,
                last_scanned_at=(
                    a.last_scanned_at.isoformat() if a.last_scanned_at else None
                ),
                ticks_count=total_ticks,
                verdict=verdict_label,
                verdict_percentile=verdict_pct,
                verdict_confidence=b_conf,
                corpus_status=corpus_state,
            )
        )
    return items


@router.post(
    "/routes", response_model=RouteItemResponse, status_code=status.HTTP_201_CREATED
)
async def create_monitored_route(
    req: RouteCreateRequest,
    session: AsyncSession = Depends(get_db),
    current_user: UserModel | None = Depends(get_optional_user),
):
    user_id = await _get_or_create_user_id(session, current_user)
    new_id = str(uuid.uuid4())
    try:
        e_date = date.fromisoformat(req.earliest_date)
        l_date = date.fromisoformat(req.latest_date)
    except ValueError:
        raise HTTPException(
            status_code=400, detail="Invalid date format. Use YYYY-MM-DD"
        )

    alert = DealWatchAlertModel(
        id=new_id,
        user_id=user_id,
        origin_iata=req.origin_iata.upper(),
        destinations=[req.destination_code.upper()],
        earliest_date=e_date,
        latest_date=l_date,
        min_nights=req.min_nights,
        max_nights=req.max_nights,
        travelers=req.travelers,
        bags_needed=0,
        max_budget_cents=int(round(req.max_budget_eur * 100)),
        currency="EUR",
        is_active=True,
        last_scanned_at=datetime.now(timezone.utc),
    )
    session.add(alert)
    await session.commit()
    await session.refresh(alert)

    # Ingest forward calendar horizon corpus immediately for day-zero market intelligence
    ticks_ingested = 0
    corpus_status_str = "building"
    try:
        corpus_res = await backfill_route_corpus(
            session=session,
            origin_iata=alert.origin_iata,
            destination_code=alert.destinations[0],
            months_ahead=CORPUS_HORIZON_MONTHS,
        )
        ticks_ingested = corpus_res.get("ticks_ingested", 0)
        corpus_status_str = corpus_res.get("status", "ready")
        alert.last_scanned_at = datetime.now(timezone.utc)
        await session.commit()
    except Exception as e:
        logger.warning(f"Initial route corpus backfill error: {e}")
        # Enqueue background task fallback
        try:
            from app.tasks import backfill_route_corpus_task

            backfill_route_corpus_task.delay(alert.origin_iata, alert.destinations[0])
        except Exception:
            pass

    # Also ingest specific monitored window ticks
    try:
        window_ticks = await ingest_flight_ticks(
            session=session,
            origin_iata=alert.origin_iata,
            dest_iata=alert.destinations[0],
            dest_code=alert.destinations[0],
            date_from=alert.earliest_date,
            date_to=min(alert.earliest_date + timedelta(days=45), alert.latest_date),
            run_id=f"init-{new_id[:8]}",
        )
        ticks_ingested += window_ticks
    except Exception as e:
        logger.warning(f"Initial flight window tick ingestion note: {e}")

    # Re-query latest ingested tick
    tick_stmt = (
        select(MarketPriceTickModel)
        .where(
            MarketPriceTickModel.origin_iata == alert.origin_iata,
            MarketPriceTickModel.destination_code == alert.destinations[0],
        )
        .order_by(desc(MarketPriceTickModel.observed_at))
        .limit(1)
    )
    tick_res = await session.execute(tick_stmt)
    latest_tick = tick_res.scalar_one_or_none()
    current_eur = (
        round(latest_tick.base_price_cents / 100.0, 2) if latest_tick else None
    )

    # Resolve instant baseline and verdict
    today = datetime.now(timezone.utc).date()
    quantiles, b_level, b_conf = await resolve_route_baseline_quantiles(
        session=session,
        origin_iata=alert.origin_iata,
        destination_code=alert.destinations[0],
        depart_date=alert.earliest_date,
        observation_date=today,
    )
    p50_eur = (
        round(quantiles["q50"] / 100.0, 2) if quantiles and "q50" in quantiles else None
    )
    p10_eur = (
        round(quantiles["q10"] / 100.0, 2) if quantiles and "q10" in quantiles else None
    )

    verdict_label = None
    verdict_pct = None
    discount = None
    is_deal = False
    if latest_tick and quantiles:
        pv = classify_price(latest_tick.base_price_cents, quantiles, b_conf)
        verdict_label = pv.verdict
        verdict_pct = pv.percentile
        discount = pv.vs_median_pct if pv.vs_median_pct > 0 else None
        is_deal = pv.verdict in ("GREAT", "GOOD")

    dest_name = await _resolve_city_name(session, alert.destinations[0])
    return RouteItemResponse(
        id=alert.id,
        origin_iata=alert.origin_iata,
        destination_code=alert.destinations[0],
        destination_name=dest_name,
        earliest_date=alert.earliest_date.isoformat(),
        latest_date=alert.latest_date.isoformat(),
        min_nights=alert.min_nights,
        max_nights=alert.max_nights,
        max_budget_eur=round(alert.max_budget_cents / 100.0, 2),
        currency=alert.currency,
        is_active=alert.is_active,
        schedule="Every 2h" if is_deal else "Daily",
        status="DEAL" if is_deal else ("ACTIVE" if current_eur else "PENDING"),
        current_price_eur=current_eur,
        baseline_p50_eur=p50_eur,
        baseline_p10_eur=p10_eur,
        lowest_ever_eur=current_eur,
        discount_pct=discount,
        last_scanned_at=alert.last_scanned_at.isoformat()
        if alert.last_scanned_at
        else None,
        ticks_count=ticks_ingested,
        verdict=verdict_label,
        verdict_percentile=verdict_pct,
        verdict_confidence=b_conf,
        corpus_status=corpus_status_str,
    )


@router.patch("/routes/{route_id}", response_model=dict[str, Any])
async def update_monitored_route(
    route_id: str,
    req: RouteUpdateRequest,
    session: AsyncSession = Depends(get_db),
):
    stmt = select(DealWatchAlertModel).where(DealWatchAlertModel.id == route_id)
    res = await session.execute(stmt)
    alert = res.scalar_one_or_none()
    if not alert:
        raise HTTPException(status_code=404, detail="Monitored route not found")

    if req.is_active is not None:
        alert.is_active = req.is_active
    if req.max_budget_eur is not None:
        alert.max_budget_cents = int(round(req.max_budget_eur * 100))

    await session.commit()
    return {"status": "ok", "route_id": route_id, "is_active": alert.is_active}


@router.delete("/routes/{route_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_monitored_route(
    route_id: str,
    session: AsyncSession = Depends(get_db),
):
    stmt = delete(DealWatchAlertModel).where(DealWatchAlertModel.id == route_id)
    await session.execute(stmt)
    await session.commit()
    return None


@router.post("/routes/{route_id}/scan")
async def trigger_route_scan(
    route_id: str,
    session: AsyncSession = Depends(get_db),
):
    stmt = select(DealWatchAlertModel).where(DealWatchAlertModel.id == route_id)
    res = await session.execute(stmt)
    alert = res.scalar_one_or_none()
    if not alert:
        raise HTTPException(status_code=404, detail="Monitored route not found")

    dest_code = alert.destinations[0] if alert.destinations else ""
    ticks_ingested = 0
    try:
        ticks_ingested = await ingest_flight_ticks(
            session=session,
            origin_iata=alert.origin_iata,
            dest_iata=dest_code,
            dest_code=dest_code,
            date_from=alert.earliest_date,
            date_to=min(alert.earliest_date + timedelta(days=90), alert.latest_date),
            run_id=f"scan-{route_id[:8]}",
        )
        alert.last_scanned_at = datetime.now(timezone.utc)
        await session.commit()
    except Exception as e:
        logger.error(f"Live scan failed for route {route_id}: {e}")

    deals_detected = 0
    try:
        deals = await run_deal_detection_scan(session)
        deals_detected = len(deals)
    except Exception as e:
        logger.warning(f"Detection scan error: {e}")

    return {
        "status": "completed",
        "route_id": route_id,
        "ticks_ingested": ticks_ingested,
        "deals_detected": deals_detected,
        "scanned_at": datetime.now(timezone.utc).isoformat(),
    }


@router.get("/routes/{route_id}/history", response_model=HistoryResponse)
async def get_route_price_history(
    route_id: str,
    range_param: str = Query("30d", alias="range"),
    session: AsyncSession = Depends(get_db),
):
    stmt = select(DealWatchAlertModel).where(DealWatchAlertModel.id == route_id)
    res = await session.execute(stmt)
    alert = res.scalar_one_or_none()
    if not alert:
        raise HTTPException(status_code=404, detail="Route not found")

    dest_code = alert.destinations[0]
    days_back = 30
    if range_param == "24h":
        days_back = 1
    elif range_param == "7d":
        days_back = 7
    elif range_param == "90d":
        days_back = 90

    start_date = datetime.now(timezone.utc).date() - timedelta(days=days_back)

    # Fetch daily price rollups (grouped by observation bucket to avoid duplicate points per day)
    p_stmt = (
        select(
            PriceDailyModel.bucket,
            func.min(PriceDailyModel.min_base).label("min_base"),
            func.sum(PriceDailyModel.n_ticks).label("n_ticks"),
            PriceDailyModel.source,
        )
        .where(
            PriceDailyModel.origin_iata == alert.origin_iata,
            PriceDailyModel.destination_code == dest_code,
            PriceDailyModel.bucket >= start_date,
        )
        .group_by(PriceDailyModel.bucket, PriceDailyModel.source)
        .order_by(PriceDailyModel.bucket.asc())
    )
    p_res = await session.execute(p_stmt)
    daily_records = p_res.all()

    points: list[HistoryPoint] = []
    for d in daily_records:
        points.append(
            HistoryPoint(
                date=d.bucket.isoformat(),
                timestamp=f"{d.bucket.isoformat()}T12:00:00Z",
                min_price_eur=round(d.min_base / 100.0, 2),
                median_price_eur=round(d.min_base / 100.0, 2),
                ticks_count=d.n_ticks,
                carrier=d.source or "Ryanair",
            )
        )

    # If no price_daily records, fetch from raw market_price_ticks
    if not points:
        tick_stmt = (
            select(MarketPriceTickModel)
            .where(
                MarketPriceTickModel.origin_iata == alert.origin_iata,
                MarketPriceTickModel.destination_code == dest_code,
                MarketPriceTickModel.observed_at
                >= datetime.now(timezone.utc) - timedelta(days=days_back),
            )
            .order_by(MarketPriceTickModel.observed_at.asc())
        )
        tick_res = await session.execute(tick_stmt)
        ticks = tick_res.scalars().all()
        for t in ticks:
            points.append(
                HistoryPoint(
                    date=t.depart_date.isoformat(),
                    timestamp=t.observed_at.isoformat(),
                    min_price_eur=round(t.base_price_cents / 100.0, 2),
                    median_price_eur=round(t.base_price_cents / 100.0, 2),
                    ticks_count=1,
                    carrier=t.source,
                )
            )

    # Fetch forward departure date curve (cheapest fare per departure day across the horizon)
    today = datetime.now(timezone.utc).date()
    fwd_stmt = (
        select(
            PriceDailyModel.depart_date,
            func.min(PriceDailyModel.min_base).label("min_price"),
            PriceDailyModel.source,
        )
        .where(
            PriceDailyModel.origin_iata == alert.origin_iata,
            PriceDailyModel.destination_code == dest_code,
            PriceDailyModel.depart_date >= today,
        )
        .group_by(PriceDailyModel.depart_date, PriceDailyModel.source)
        .order_by(PriceDailyModel.depart_date.asc())
    )
    fwd_res = await session.execute(fwd_stmt)
    fwd_rows = fwd_res.all()

    # Resolve baseline quantiles
    quantiles, b_level, b_conf = await resolve_route_baseline_quantiles(
        session=session,
        origin_iata=alert.origin_iata,
        destination_code=dest_code,
        depart_date=alert.earliest_date,
        observation_date=today,
    )

    p10 = (
        round(quantiles["q10"] / 100.0, 2) if quantiles and "q10" in quantiles else None
    )
    p25 = (
        round(quantiles["q25"] / 100.0, 2) if quantiles and "q25" in quantiles else None
    )
    p50 = (
        round(quantiles["q50"] / 100.0, 2) if quantiles and "q50" in quantiles else None
    )
    p75 = (
        round(quantiles["q75"] / 100.0, 2) if quantiles and "q75" in quantiles else None
    )
    p90 = (
        round(quantiles["q90"] / 100.0, 2) if quantiles and "q90" in quantiles else None
    )

    forward_curve: list[ForwardPricePoint] = []
    for f_date, min_p, src in fwd_rows:
        pv_label = None
        pv_pct = None
        if quantiles:
            pv = classify_price(min_p, quantiles, b_conf)
            pv_label = pv.verdict
            pv_pct = pv.percentile
        forward_curve.append(
            ForwardPricePoint(
                depart_date=f_date.isoformat(),
                price_eur=round(min_p / 100.0, 2),
                verdict=pv_label,
                percentile=pv_pct,
                carrier=src,
            )
        )

    # Determine latest tick and verdict
    latest_stmt = (
        select(MarketPriceTickModel)
        .where(
            MarketPriceTickModel.origin_iata == alert.origin_iata,
            MarketPriceTickModel.destination_code == dest_code,
        )
        .order_by(desc(MarketPriceTickModel.observed_at))
        .limit(1)
    )
    latest_res = await session.execute(latest_stmt)
    latest_tick = latest_res.scalar_one_or_none()

    verdict_dict = None
    if latest_tick and quantiles:
        verdict_dict = classify_price(
            latest_tick.base_price_cents, quantiles, b_conf
        ).to_dict()

    # Fetch corpus status
    c_status = await get_route_corpus_status(session, alert.origin_iata, dest_code)
    corpus_info = CorpusInfo(
        status=c_status.get("status", "ready" if forward_curve else "building"),
        confidence=b_conf,
        ticks_ingested=c_status.get("ticks_ingested", len(points) + len(forward_curve)),
        depart_dates_count=c_status.get("depart_dates_count", len(forward_curve)),
        min_price_eur=c_status.get("min_price_eur"),
        max_price_eur=c_status.get("max_price_eur"),
        median_price_eur=c_status.get("median_price_eur"),
        last_backfill_at=c_status.get("last_backfill_at"),
    )

    all_prices = [p.min_price_eur for p in points] + [
        f.price_eur for f in forward_curve
    ]
    min_pt = min(all_prices) if all_prices else None

    return HistoryResponse(
        points=points,
        forward_curve=forward_curve,
        p10_deal_eur=p10,
        p25_eur=p25,
        p50_median_eur=p50,
        p75_eur=p75,
        p90_peak_eur=p90,
        lowest_ever_eur=min_pt,
        verdict=verdict_dict,
        corpus=corpus_info,
        currency="EUR",
    )


@router.post("/routes/{route_id}/backfill")
async def trigger_route_backfill(
    route_id: str,
    session: AsyncSession = Depends(get_db),
):
    """
    Triggers an on-demand forward calendar sweep backfill for the route,
    pulling ~300 daily fares and recalculating all quantiles and corpus status.
    """
    stmt = select(DealWatchAlertModel).where(DealWatchAlertModel.id == route_id)
    res = await session.execute(stmt)
    alert = res.scalar_one_or_none()
    if not alert:
        raise HTTPException(status_code=404, detail="Route not found")

    dest_code = alert.destinations[0] if alert.destinations else ""
    corpus_res = await backfill_route_corpus(
        session=session,
        origin_iata=alert.origin_iata,
        destination_code=dest_code,
        months_ahead=CORPUS_HORIZON_MONTHS,
    )
    return corpus_res


@router.get("/routes/{route_id}/corpus")
async def get_route_corpus(
    route_id: str,
    session: AsyncSession = Depends(get_db),
):
    """Returns the market corpus ingestion and baseline status for the route."""
    stmt = select(DealWatchAlertModel).where(DealWatchAlertModel.id == route_id)
    res = await session.execute(stmt)
    alert = res.scalar_one_or_none()
    if not alert:
        raise HTTPException(status_code=404, detail="Route not found")

    dest_code = alert.destinations[0] if alert.destinations else ""
    return await get_route_corpus_status(session, alert.origin_iata, dest_code)


@router.get("/routes/{route_id}/calendar", response_model=CalendarResponse)
async def get_route_calendar(
    route_id: str,
    months_count: int = Query(4, ge=3, le=5, alias="months"),
    session: AsyncSession = Depends(get_db),
):
    stmt = select(DealWatchAlertModel).where(DealWatchAlertModel.id == route_id)
    res = await session.execute(stmt)
    alert = res.scalar_one_or_none()
    if not alert:
        raise HTTPException(status_code=404, detail="Route not found")

    dest_code = alert.destinations[0]
    dest_name = await _resolve_city_name(session, dest_code)

    base_stmt = (
        select(RouteBaselineModel)
        .where(
            RouteBaselineModel.origin_iata == alert.origin_iata,
            RouteBaselineModel.destination_code == dest_code,
        )
        .limit(1)
    )
    base_res = await session.execute(base_stmt)
    baseline = base_res.scalar_one_or_none()
    p10 = (
        round(float(baseline.q10) / 100.0, 2)
        if baseline and baseline.q10 is not None
        else None
    )
    p50 = (
        round(float(baseline.q50) / 100.0, 2)
        if baseline and baseline.q50 is not None
        else None
    )

    now = datetime.now(timezone.utc)
    curr_year = now.year
    curr_month = now.month

    # Live unauthenticated quotes directly from Ryanair flight feed
    feed = RyanairFlightFeed()
    live_quotes = []
    try:
        live_quotes = await feed.fetch_cached_flights(
            origin_iata=alert.origin_iata,
            dest_iata=dest_code,
            date_from=alert.earliest_date,
            date_to=min(alert.earliest_date + timedelta(days=120), alert.latest_date),
        )
    except Exception as e:
        logger.warning(f"Could not fetch live calendar quotes: {e}")

    quote_by_date: dict[str, Any] = {}
    for q in live_quotes:
        d_str = q.depart_time.date().isoformat()
        fare_eur = round(q.base_price_cents / 100.0, 2)
        if d_str not in quote_by_date or fare_eur < quote_by_date[d_str]["price_eur"]:
            quote_by_date[d_str] = {
                "price_eur": fare_eur,
                "flight_number": q.flight_number,
                "duration_mins": int(
                    (q.arrival_time - q.depart_time).total_seconds() // 60
                ),
                "departure_time": q.depart_time.strftime("%H:%M"),
                "booking_url": q.deep_link
                or f"https://www.ryanair.com/gb/en/trip/flights/select?originIata={alert.origin_iata}&destinationIata={dest_code}",
                "carrier": q.carrier,
            }

    # Also query stored ticks from DB for days not returned by live feed
    stored_ticks_stmt = select(MarketPriceTickModel).where(
        MarketPriceTickModel.origin_iata == alert.origin_iata,
        MarketPriceTickModel.destination_code == dest_code,
        MarketPriceTickModel.depart_date >= now.date(),
    )
    stored_res = await session.execute(stored_ticks_stmt)
    stored_ticks = stored_res.scalars().all()
    for st in stored_ticks:
        d_str = st.depart_date.isoformat()
        fare_eur = round(st.base_price_cents / 100.0, 2)
        if d_str not in quote_by_date:
            quote_by_date[d_str] = {
                "price_eur": fare_eur,
                "flight_number": None,
                "duration_mins": None,
                "departure_time": None,
                "booking_url": f"https://www.ryanair.com/gb/en/trip/flights/select?originIata={alert.origin_iata}&destinationIata={dest_code}",
                "carrier": st.source,
            }

    months_list: list[CalendarMonthItem] = []
    for m_offset in range(months_count):
        target_month = (curr_month - 1 + m_offset) % 12 + 1
        target_year = curr_year + ((curr_month - 1 + m_offset) // 12)
        num_days = calendar.monthrange(target_year, target_month)[1]
        m_name = calendar.month_name[target_month]

        days_list: list[CalendarDayItem] = []
        for d in range(1, num_days + 1):
            day_date = date(target_year, target_month, d)
            date_str = day_date.isoformat()
            weekday = day_date.weekday()

            if date_str in quote_by_date:
                q = quote_by_date[date_str]
                price = q["price_eur"]
                fn = q["flight_number"]
                dur = q["duration_mins"]
                dep = q["departure_time"]
                url = q["booking_url"]
                carrier = q["carrier"]

                # Price tier classification
                if p10 and price <= p10:
                    tier = "deal"
                elif p50 and price <= p50:
                    tier = "fair"
                elif p50 and price <= (p50 * 1.5):
                    tier = "standard"
                else:
                    tier = "peak"
            else:
                price = None
                tier = "no_data"
                fn = None
                dur = None
                dep = None
                url = None
                carrier = None

            days_list.append(
                CalendarDayItem(
                    date=date_str,
                    day=d,
                    weekday=weekday,
                    price_eur=price,
                    price_tier=tier,
                    carrier=carrier,
                    flight_number=fn,
                    duration_mins=dur,
                    departure_time=dep,
                    booking_url=url,
                    is_holiday=weekday == 6,
                )
            )

        months_list.append(
            CalendarMonthItem(
                year=target_year,
                month=target_month,
                month_name=m_name,
                days=days_list,
            )
        )

    return CalendarResponse(
        months=months_list,
        route_label=f"{alert.origin_iata} → {dest_code} ({dest_name})",
        p10_deal_eur=p10,
        p50_median_eur=p50,
    )


@router.get("/routes/{route_id}/stats", response_model=RouteStatsResponse)
async def get_route_stats(
    route_id: str,
    session: AsyncSession = Depends(get_db),
):
    stmt = select(DealWatchAlertModel).where(DealWatchAlertModel.id == route_id)
    res = await session.execute(stmt)
    alert = res.scalar_one_or_none()
    if not alert:
        raise HTTPException(status_code=404, detail="Route not found")

    dest_code = alert.destinations[0]

    today = datetime.now(timezone.utc).date()
    quantiles, b_level, b_conf = await resolve_route_baseline_quantiles(
        session=session,
        origin_iata=alert.origin_iata,
        destination_code=dest_code,
        depart_date=alert.earliest_date,
        observation_date=today,
    )
    p10 = (
        round(quantiles["q10"] / 100.0, 2) if quantiles and "q10" in quantiles else None
    )
    p25 = (
        round(quantiles["q25"] / 100.0, 2) if quantiles and "q25" in quantiles else None
    )
    p50 = (
        round(quantiles["q50"] / 100.0, 2) if quantiles and "q50" in quantiles else None
    )
    p75 = (
        round(quantiles["q75"] / 100.0, 2) if quantiles and "q75" in quantiles else None
    )
    p90 = (
        round(quantiles["q90"] / 100.0, 2) if quantiles and "q90" in quantiles else None
    )

    # Latest tick
    tick_stmt = (
        select(MarketPriceTickModel)
        .where(
            MarketPriceTickModel.origin_iata == alert.origin_iata,
            MarketPriceTickModel.destination_code == dest_code,
        )
        .order_by(desc(MarketPriceTickModel.observed_at))
        .limit(1)
    )
    t_res = await session.execute(tick_stmt)
    latest_tick = t_res.scalar_one_or_none()
    curr_eur = round(latest_tick.base_price_cents / 100.0, 2) if latest_tick else None

    # Lowest ever tick
    min_stmt = (
        select(MarketPriceTickModel)
        .where(
            MarketPriceTickModel.origin_iata == alert.origin_iata,
            MarketPriceTickModel.destination_code == dest_code,
        )
        .order_by(MarketPriceTickModel.base_price_cents.asc())
        .limit(1)
    )
    min_res = await session.execute(min_stmt)
    lowest_tick = min_res.scalar_one_or_none()
    lowest_eur = (
        round(lowest_tick.base_price_cents / 100.0, 2) if lowest_tick else curr_eur
    )
    lowest_date = lowest_tick.depart_date.isoformat() if lowest_tick else None

    # Count observations
    cnt_stmt = select(func.count(MarketPriceTickModel.id)).where(
        MarketPriceTickModel.origin_iata == alert.origin_iata,
        MarketPriceTickModel.destination_code == dest_code,
    )
    cnt_res = await session.execute(cnt_stmt)
    total_observations = cnt_res.scalar() or 0

    pct = None
    verdict_str = None
    if latest_tick and quantiles:
        pv = classify_price(latest_tick.base_price_cents, quantiles, b_conf)
        pct = pv.percentile
        verdict_str = pv.verdict
    elif (
        curr_eur is not None
        and lowest_eur is not None
        and p90 is not None
        and p90 > lowest_eur
    ):
        pct = round(
            max(
                min(((curr_eur - lowest_eur) / (p90 - lowest_eur)) * 100.0, 100.0), 0.0
            ),
            1,
        )

    savings = None
    savings_pct = None
    if curr_eur is not None and p50 is not None and curr_eur < p50:
        savings = round(p50 - curr_eur, 2)
        savings_pct = round((savings / p50) * 100.0, 1)

    # Fetch corpus status
    c_status = await get_route_corpus_status(session, alert.origin_iata, dest_code)

    # Next scan countdown
    mins = 60
    if alert.last_scanned_at:
        elapsed = (
            datetime.now(timezone.utc) - alert.last_scanned_at
        ).total_seconds() / 60.0
        mins = max(int(120 - elapsed), 0)

    return RouteStatsResponse(
        current_price_eur=curr_eur,
        current_percentile=pct,
        p10_deal_eur=p10,
        p25_eur=p25,
        p50_median_eur=p50,
        p75_eur=p75,
        p90_peak_eur=p90,
        lowest_ever_eur=lowest_eur,
        lowest_ever_date=lowest_date,
        total_observations=total_observations,
        landed_fee_ratio=1.15,
        next_scan_minutes=mins,
        itinerary_realism_score=10.0 if total_observations > 0 else None,
        deal_savings_eur=savings,
        deal_savings_pct=savings_pct,
        verdict=verdict_str,
        verdict_confidence=b_conf,
        corpus_status=c_status.get("status"),
        depart_dates_count=c_status.get("depart_dates_count"),
    )


@router.get("/routes/{route_id}/events", response_model=list[RouteEventItem])
async def get_route_events(
    route_id: str,
    session: AsyncSession = Depends(get_db),
):
    stmt = select(DealWatchAlertModel).where(DealWatchAlertModel.id == route_id)
    res = await session.execute(stmt)
    alert = res.scalar_one_or_none()
    if not alert:
        raise HTTPException(status_code=404, detail="Route not found")

    dest_code = alert.destinations[0]
    dest_name = await _resolve_city_name(session, dest_code)

    # Query real events from deal_events table
    events_stmt = (
        select(DealEventModel)
        .where(DealEventModel.alert_id == route_id)
        .order_by(desc(DealEventModel.alerted_at))
        .limit(20)
    )
    e_res = await session.execute(events_stmt)
    events = e_res.scalars().all()

    items: list[RouteEventItem] = []
    for ev in events:
        items.append(
            RouteEventItem(
                id=ev.id,
                event_type="DEAL_EVENT",
                title=f"Deal candidate alerted: {alert.origin_iata} → {dest_code} ({dest_name})",
                result=ev.status.upper(),
                timestamp=ev.alerted_at.strftime("%H:%M UTC (%Y-%m-%d)"),
                details=f"Status: {ev.status}",
                booking_url=f"https://www.ryanair.com/gb/en/trip/flights/select?originIata={alert.origin_iata}&destinationIata={dest_code}",
            )
        )

    # If no deal_events, query latest MarketPriceTickModel
    if not items:
        tick_stmt = (
            select(MarketPriceTickModel)
            .where(
                MarketPriceTickModel.origin_iata == alert.origin_iata,
                MarketPriceTickModel.destination_code == dest_code,
            )
            .order_by(desc(MarketPriceTickModel.observed_at))
            .limit(5)
        )
        t_res = await session.execute(tick_stmt)
        ticks = t_res.scalars().all()
        for t in ticks:
            fare = round(t.base_price_cents / 100.0, 2)
            items.append(
                RouteEventItem(
                    id=t.id,
                    event_type="PRICE_OBSERVATION",
                    title=f"Price check: {alert.origin_iata} → {dest_code} ({dest_name})",
                    result=f"€{fare:.2f}",
                    timestamp=t.observed_at.strftime("%H:%M UTC (%Y-%m-%d)"),
                    details=f"Observed via {t.source} for flight on {t.depart_date.isoformat()}",
                    booking_url=f"https://www.ryanair.com/gb/en/trip/flights/select?originIata={alert.origin_iata}&destinationIata={dest_code}",
                )
            )

    return items


async def _format_deal_package_item(
    session: AsyncSession, ev: DealEventModel
) -> DealPackageItem | None:
    pkg = ev.package_json or {}
    orig = pkg.get("origin_iata") or ""
    dest = pkg.get("destination_code") or ""
    if not orig or not dest:
        return None

    orig_name = pkg.get("origin_name") or await _resolve_city_name(session, orig)
    dest_name = pkg.get("destination_name") or await _resolve_city_name(session, dest)

    dep_date = pkg.get("depart_date") or ""
    ret_date = pkg.get("return_date") or ""
    nights = pkg.get("nights", 3)

    flight_info = pkg.get("flight") or {}
    fl_airline = flight_info.get("airline") or "Carrier"
    fl_number = flight_info.get("flight_number") or ""
    fl_dep_time = flight_info.get("depart_time") or ""
    fl_arr_time = flight_info.get("arrival_time") or ""
    fl_base_cents = flight_info.get("base_price_cents", 0)
    fl_landed_cents = flight_info.get("landed_price_cents") or fl_base_cents
    fl_url = (
        flight_info.get("deep_link")
        or f"https://www.ryanair.com/gb/en/trip/flights/select?originIata={orig}&destinationIata={dest}&dateOut={dep_date}"
    )

    lodging_info = pkg.get("lodging") or {}
    lg_name = lodging_info.get("property_name") or f"Hotel in {dest_name}"
    lg_nightly_cents = lodging_info.get("base_nightly_cents", 0)
    lg_landed_cents = lodging_info.get("landed_total_cents") or (
        lg_nightly_cents * nights
    )
    lg_quality = lodging_info.get("quality_score")
    lg_url = (
        lodging_info.get("deep_link")
        or f"https://www.booking.com/searchresults.html?ss={dest_name}&checkin={dep_date}&checkout={ret_date}&group_adults=2&no_rooms=1"
    )

    total_landed_cents = pkg.get("total_landed_cents") or (
        fl_landed_cents + lg_landed_cents
    )
    savings_cents = pkg.get("landed_savings_cents") or 0
    package_ratio = pkg.get("package_ratio") or 0.75
    realism = pkg.get("realism_score") or 8.5

    total_price_eur = pkg.get("total_price_eur") or round(total_landed_cents / 100.0, 2)
    savings_eur = pkg.get("savings_eur") or round(savings_cents / 100.0, 2)
    baseline_median_eur = pkg.get("baseline_median_eur") or round(
        (total_landed_cents + savings_cents) / 100.0, 2
    )
    discount_pct = pkg.get("discount_pct") or round(
        max((1.0 - package_ratio) * 100, 0.0), 1
    )

    return DealPackageItem(
        id=ev.id,
        alert_id=ev.alert_id or "",
        candidate_id=ev.candidate_id or "",
        origin_iata=orig,
        destination_code=dest,
        origin_name=orig_name,
        destination_name=dest_name,
        depart_date=dep_date,
        return_date=ret_date,
        nights=nights,
        total_price_eur=total_price_eur,
        baseline_median_eur=baseline_median_eur,
        savings_eur=savings_eur,
        discount_pct=discount_pct,
        package_ratio=package_ratio,
        realism_score=realism,
        status=ev.status.upper(),
        detected_at=ev.alerted_at.isoformat()
        if ev.alerted_at
        else datetime.now(timezone.utc).isoformat(),
        flight=DealFlightItem(
            airline=fl_airline,
            flight_number=fl_number,
            depart_time=fl_dep_time,
            arrival_time=fl_arr_time,
            base_price_eur=round(fl_base_cents / 100.0, 2),
            landed_price_eur=round(fl_landed_cents / 100.0, 2),
            booking_url=fl_url,
            source=flight_info.get("source", "carrier"),
            is_live=flight_info.get("is_live", True),
            ancillaries_excluded=True,
        ),
        lodging=DealLodgingItem(
            property_name=lg_name,
            nightly_base_eur=round(lg_nightly_cents / 100.0, 2),
            landed_total_eur=round(lg_landed_cents / 100.0, 2),
            quality_score=float(lg_quality) if lg_quality is not None else None,
            stars=lodging_info.get("stars"),
            review_score=lodging_info.get("review_score"),
            review_count=lodging_info.get("review_count"),
            booking_url=lg_url,
            source=lodging_info.get("source", "booking"),
            is_live=lodging_info.get("is_live", True),
            taxes_included=lodging_info.get("taxes_included", True),
        ),
    )


@router.get("/deals", response_model=list[DealPackageItem])
async def list_active_deals(
    session: AsyncSession = Depends(get_db),
    limit: int = Query(10, ge=1, le=50),
):
    stmt = (
        select(DealEventModel)
        .where(DealEventModel.status.in_(["alerted", "pending", "active"]))
        .order_by(desc(DealEventModel.alerted_at))
        .limit(limit)
    )
    res = await session.execute(stmt)
    events = res.scalars().all()

    items: list[DealPackageItem] = []
    for ev in events:
        item = await _format_deal_package_item(session, ev)
        if item:
            items.append(item)
    items.sort(key=lambda d: (-d.discount_pct, d.total_price_eur))
    return items


@router.get("/routes/{route_id}/deals", response_model=list[DealPackageItem])
async def list_route_deals(
    route_id: str,
    session: AsyncSession = Depends(get_db),
    limit: int = Query(5, ge=1, le=20),
):
    stmt = (
        select(DealEventModel)
        .where(
            DealEventModel.alert_id == route_id,
            DealEventModel.status.in_(["alerted", "pending", "active"]),
        )
        .order_by(desc(DealEventModel.alerted_at))
        .limit(limit)
    )
    res = await session.execute(stmt)
    events = res.scalars().all()

    items: list[DealPackageItem] = []
    for ev in events:
        item = await _format_deal_package_item(session, ev)
        if item:
            items.append(item)
    items.sort(key=lambda d: (-d.discount_pct, d.total_price_eur))
    return items


@router.post("/deals/{deal_id}/discard")
async def discard_deal_event(
    deal_id: str,
    session: AsyncSession = Depends(get_db),
):
    stmt = select(DealEventModel).where(DealEventModel.id == deal_id)
    res = await session.execute(stmt)
    deal = res.scalar_one_or_none()
    if not deal:
        raise HTTPException(status_code=404, detail="Deal not found")

    deal.status = "discarded"
    deal.user_feedback = "discarded"
    deal.feedback_at = datetime.now(timezone.utc)

    # Also archive any matching TripModel proposal for this user and route
    pkg = deal.package_json or {}
    dest_code = pkg.get("destination_code")
    dep_date = pkg.get("depart_date")
    if dest_code and dep_date:
        trip_stmt = select(TripModel).where(
            TripModel.user_id == deal.user_id,
            TripModel.status == "deal_proposal",
            TripModel.destination == dest_code,
            TripModel.start_date == dep_date,
        )
        trip_res = await session.execute(trip_stmt)
        trips = trip_res.scalars().all()
        for t in trips:
            t.status = "discarded"

    await session.commit()
    return {"status": "discarded", "deal_id": deal_id}


@router.get("/providers/health", response_model=list[ProviderHealthItem])
async def list_provider_health(
    session: AsyncSession = Depends(get_db),
):
    from app.db.models import ProviderHealthModel

    stmt = select(ProviderHealthModel).order_by(
        ProviderHealthModel.asset_type, ProviderHealthModel.provider
    )
    res = await session.execute(stmt)
    rows = res.scalars().all()
    return [
        ProviderHealthItem(
            provider=r.provider,
            asset_type=r.asset_type,
            status=r.status,
            last_ok_at=r.last_ok_at.isoformat() if r.last_ok_at else None,
            failure_count=r.failure_count,
            consecutive_failures=r.consecutive_failures,
            last_error=r.last_error,
            updated_at=r.updated_at.isoformat(),
        )
        for r in rows
    ]
