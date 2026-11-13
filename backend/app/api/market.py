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
    HotelPropertyModel,
    HotelRateObservationModel,
    MarketPriceTickModel,
    PriceDailyModel,
    RouteBaselineModel,
    TripModel,
    UserModel,
)
from app.db.session import get_db
from app.engine.market.adapters import CompositeFlightFeed
from app.engine.market.baselines import (
    resolve_baseline_median,
    resolve_route_baseline_quantiles,
)
from app.engine.market.config import CORPUS_HORIZON_MONTHS
from app.engine.market.corpus import backfill_route_corpus, get_route_corpus_status
from app.engine.market.deal_package_service import deal_package_service
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
    """Dynamically resolves city display name from CityModel, DestinationAirportModel, or AirportService."""
    code_clean = (code or "").strip().upper()
    if not code_clean:
        return code

    # First check DestinationAirportModel mapped to CityModel
    stmt = (
        select(CityModel.name)
        .join(DestinationAirportModel, DestinationAirportModel.city_id == CityModel.id)
        .where(DestinationAirportModel.iata == code_clean)
        .limit(1)
    )
    res = await session.execute(stmt)
    name = res.scalar_one_or_none()
    if name:
        return name

    # Next check CityModel by id or name match
    stmt_city = (
        select(CityModel.name)
        .where(
            (CityModel.id.ilike(f"{code_clean}%"))
            | (CityModel.name.ilike(f"{code_clean}%"))
        )
        .limit(1)
    )
    res_city = await session.execute(stmt_city)
    name_city = res_city.scalar_one_or_none()
    if name_city:
        return name_city

    # Use centralized AirportService
    from app.services.airport_service import get_airport_service

    city = get_airport_service().get_city_from_iata(code_clean)
    if city and city != "Unknown":
        return city

    return code


async def _get_or_create_user_id(session: AsyncSession, user: UserModel | None) -> str:
    if isinstance(user, UserModel) and user.id:
        return user.id
    res = await session.execute(select(UserModel).limit(1))
    first_user = res.scalar_one_or_none()
    if first_user:
        return first_user.id
    new_user = UserModel(
        id=str(uuid.uuid4()),
        email="operator@paladio.local",
        username="PaladioOperator",
        role="admin",
        is_active=True,
    )
    session.add(new_user)
    await session.commit()
    await session.refresh(new_user)
    return new_user.id


def _cvt_money(val: float | None, target_curr: str) -> float | None:
    """Converts a EUR amount dynamically to target currency using live FX rates."""
    if val is None:
        return None
    t_clean = (target_curr or "EUR").upper().strip()
    if t_clean in ("EUR", ""):
        return round(float(val), 2)
    from app.engine.currency import convert_currency

    return convert_currency(float(val), from_currency="EUR", to_currency=t_clean)


def _resolve_target_currency(
    currency_param: Any, current_user: Any, default: str = "EUR"
) -> str:
    curr_code = currency_param if isinstance(currency_param, str) else None
    user_pref = (
        current_user.preferences.get("default_currency")
        if isinstance(current_user, UserModel) and current_user.preferences
        else None
    )
    res = curr_code or user_pref or default
    return res.upper().strip() if res else default


# Pydantic Request / Response Schemas
class RouteCreateRequest(BaseModel):
    origin_iata: str = Field(..., min_length=3, max_length=3)
    destination_code: str = Field(..., min_length=3, max_length=10)
    earliest_date: str | None = None
    latest_date: str | None = None
    min_nights: int = 1
    max_nights: int = 30
    travelers: int = 1
    participants: list[dict[str, Any]] | None = None
    max_budget_eur: float = Field(..., gt=0)
    currency: str | None = None


class RouteUpdateRequest(BaseModel):
    is_active: bool | None = None
    max_budget_eur: float | None = None


class RouteItemResponse(BaseModel):
    id: str
    origin_iata: str
    destination_code: str
    destination_name: str
    earliest_date: str | None = None
    latest_date: str | None = None
    min_nights: int
    max_nights: int
    travelers: int = 1
    participants: list[dict[str, Any]] | None = None
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
    price_return_eur: float | None = None
    verdict: str | None = None
    percentile: float | None = None
    carrier: str | None = None
    return_carrier: str | None = None


class CorpusInfo(BaseModel):
    status: str
    confidence: str
    ticks_ingested: int
    depart_dates_count: int
    min_price_eur: float | None = None
    max_price_eur: float | None = None
    median_price_eur: float | None = None
    last_backfill_at: str | None = None


class LodgingPricePoint(BaseModel):
    date: str
    nightly_price_eur: float | None = None
    total_stay_eur: float | None = None
    property_name: str | None = None
    property_id: str | None = None
    stars: int | None = None
    review_score: float | None = None
    review_count: int | None = None
    booking_url: str | None = None
    source: str = "aggregator"
    min_eur: float | None = None
    median_eur: float | None = None
    p25_eur: float | None = None
    p75_eur: float | None = None
    n_properties: int = 0
    coverage_ratio: float | None = None
    value_score: float | None = None
    badge: str | None = None


class HistoryResponse(BaseModel):
    points: list[HistoryPoint]
    return_points: list[HistoryPoint] = Field(default_factory=list)
    forward_curve: list[ForwardPricePoint] = Field(default_factory=list)
    lodging_curve: list[LodgingPricePoint] = Field(default_factory=list)
    p10_deal_eur: float | None
    p25_eur: float | None = None
    p50_median_eur: float | None
    p75_eur: float | None = None
    p90_peak_eur: float | None
    inbound_p10_deal_eur: float | None = None
    inbound_p50_median_eur: float | None = None
    inbound_p90_peak_eur: float | None = None
    lowest_ever_eur: float | None
    verdict: dict[str, Any] | None = None
    corpus: CorpusInfo | None = None
    currency: str = "EUR"


class FlightSummary(BaseModel):
    carrier: str | None = None
    flight_number: str | None = None
    duration_mins: int | None = None
    departure_time: str | None = None
    booking_url: str | None = None
    price_eur: float | None = None


class LodgingSummary(BaseModel):
    nights: int
    price_per_night_eur: float
    total_lodging_eur: float
    property_name: str | None = None
    stars: int | None = None
    review_score: float | None = None
    review_count: int | None = None
    booking_url: str | None = None
    source: str | None = None
    currency: str = "EUR"
    value_score: float | None = None
    badge: str | None = None
    rank_reasons: list[str] = Field(default_factory=list)


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
    nights: int | None = None
    return_date: str | None = None
    outbound_flight: FlightSummary | None = None
    return_flight: FlightSummary | None = None
    lodging: LodgingSummary | None = None


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
    p90_peak_eur: float | None = None
    view: str = "roundtrip"
    pricing: str = "package"
    top_dates: list[str] = []
    currency: str = "EUR"


class HolidayMatchesRequest(BaseModel):
    holiday_dates: list[str]
    pricing: str = "package"
    currency: str | None = None


class HolidayMatchedPackage(BaseModel):
    route_id: str
    origin_iata: str
    destination_code: str
    destination_name: str
    depart_date: str
    return_date: str
    nights: int
    total_price_eur: float
    price_tier: str
    pricing: str
    currency: str = "EUR"
    outbound_flight: FlightSummary
    return_flight: FlightSummary
    lodging: LodgingSummary | None = None


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
    currency: str = "EUR"


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
    depart_time: str | None = None
    arrival_time: str | None = None
    base_price_eur: float
    landed_price_eur: float
    unit_price_eur: float | None = None
    booking_url: str | None = None
    source: str = "cache"
    is_live: bool = False
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
    source: str = "lodging"
    is_live: bool = False
    taxes_included: bool = True
    badge: str | None = None
    photo_url: str | None = None
    amenities: list[str] = Field(default_factory=list)
    room_type: str | None = None
    free_cancellation: bool | None = None
    board: str | None = None
    address: str | None = None


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
    price_per_traveler_eur: float | None = None
    baseline_median_eur: float
    median_per_traveler_eur: float | None = None
    savings_eur: float
    savings_per_traveler_eur: float | None = None
    discount_pct: float
    package_ratio: float
    realism_score: float
    status: str
    detected_at: str
    flight: DealFlightItem
    return_flight: DealFlightItem | None = None
    lodging: DealLodgingItem | None = None
    travelers: int = 1
    participants: list[dict[str, Any]] | None = None
    currency: str = "EUR"
    deal_status: str = "flight_deal_unverified"
    is_bookable: bool = False
    explanation: str | None = None
    source: str | None = None
    source_class: str | None = None
    found_at: str | None = None
    baseline_level_used: str | None = None
    feasibility: str | None = None


def _convert_deal_package_item(
    item: DealPackageItem, target_curr: str
) -> DealPackageItem:
    if target_curr == "EUR" and item.currency == "EUR":
        return item
    if item.currency == target_curr:
        return item
    item.currency = target_curr
    item.total_price_eur = (
        _cvt_money(item.total_price_eur, target_curr) or item.total_price_eur
    )
    if item.price_per_traveler_eur is not None:
        item.price_per_traveler_eur = (
            _cvt_money(item.price_per_traveler_eur, target_curr)
            or item.price_per_traveler_eur
        )
    item.baseline_median_eur = (
        _cvt_money(item.baseline_median_eur, target_curr) or item.baseline_median_eur
    )
    if item.median_per_traveler_eur is not None:
        item.median_per_traveler_eur = (
            _cvt_money(item.median_per_traveler_eur, target_curr)
            or item.median_per_traveler_eur
        )
    item.savings_eur = _cvt_money(item.savings_eur, target_curr) or item.savings_eur
    if item.savings_per_traveler_eur is not None:
        item.savings_per_traveler_eur = (
            _cvt_money(item.savings_per_traveler_eur, target_curr)
            or item.savings_per_traveler_eur
        )
    if item.flight:
        item.flight.base_price_eur = (
            _cvt_money(item.flight.base_price_eur, target_curr) or 0.0
        )
        item.flight.landed_price_eur = (
            _cvt_money(item.flight.landed_price_eur, target_curr) or 0.0
        )
        if item.flight.unit_price_eur is not None:
            item.flight.unit_price_eur = (
                _cvt_money(item.flight.unit_price_eur, target_curr)
                or item.flight.unit_price_eur
            )
    if item.return_flight:
        item.return_flight.base_price_eur = (
            _cvt_money(item.return_flight.base_price_eur, target_curr) or 0.0
        )
        item.return_flight.landed_price_eur = (
            _cvt_money(item.return_flight.landed_price_eur, target_curr) or 0.0
        )
        if item.return_flight.unit_price_eur is not None:
            item.return_flight.unit_price_eur = (
                _cvt_money(item.return_flight.unit_price_eur, target_curr)
                or item.return_flight.unit_price_eur
            )
    if item.lodging:
        item.lodging.nightly_base_eur = (
            _cvt_money(item.lodging.nightly_base_eur, target_curr) or 0.0
        )
        item.lodging.landed_total_eur = (
            _cvt_money(item.lodging.landed_total_eur, target_curr) or 0.0
        )
    return item


def _convert_holiday_matched_package(
    pkg: HolidayMatchedPackage, target_curr: str
) -> HolidayMatchedPackage:
    if target_curr in ("EUR", "") and pkg.currency in ("EUR", ""):
        return pkg
    if pkg.currency == target_curr:
        return pkg
    pkg.currency = target_curr
    pkg.total_price_eur = (
        _cvt_money(pkg.total_price_eur, target_curr) or pkg.total_price_eur
    )
    if pkg.outbound_flight and pkg.outbound_flight.price_eur is not None:
        pkg.outbound_flight.price_eur = _cvt_money(
            pkg.outbound_flight.price_eur, target_curr
        )
    if pkg.return_flight and pkg.return_flight.price_eur is not None:
        pkg.return_flight.price_eur = _cvt_money(
            pkg.return_flight.price_eur, target_curr
        )
    if pkg.lodging:
        pkg.lodging.price_per_night_eur = (
            _cvt_money(pkg.lodging.price_per_night_eur, target_curr)
            or pkg.lodging.price_per_night_eur
        )
        pkg.lodging.total_lodging_eur = (
            _cvt_money(pkg.lodging.total_lodging_eur, target_curr)
            or pkg.lodging.total_lodging_eur
        )
    return pkg


class ProviderHealthItem(BaseModel):
    provider: str
    asset_type: str
    status: str
    last_ok_at: str | None
    failure_count: int
    consecutive_failures: int
    consecutive_failure_days: int = 0
    last_coverage: float | None = None
    last_run_id: str | None = None
    last_error: str | None
    updated_at: str


class CallsVsLimit(BaseModel):
    calls_made_today: int
    daily_limit: int
    budget_fraction_used: float


class ProviderTelemetryItem(BaseModel):
    provider: str
    asset_type: str
    status: str
    success_rate: float
    consecutive_failures: int
    consecutive_failure_days: int
    last_coverage: float | None = None


class RouteMonthCoverageItem(BaseModel):
    route: str
    month: str
    days_with_price: int
    days_in_month: int
    coverage_pct: float


class VerifiedDealsDrift(BaseModel):
    count: int
    mean_drift_pct: float
    median_drift_pct: float
    max_drift_pct: float


class DailyReportResponse(BaseModel):
    run_date: str
    calls_vs_limit: CallsVsLimit
    provider_stats: list[ProviderTelemetryItem]
    route_month_coverage: list[RouteMonthCoverageItem]
    freshness_histogram: dict[str, int]
    stale_rows_count: int
    verified_deals_drift: VerifiedDealsDrift


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
    avg_savings_pct = 0.0
    if deals_cnt == 0:
        active_deals = await list_active_deals(
            session=session,
            limit=10,
            current_user=current_user if isinstance(current_user, UserModel) else None,
        )
        deals_cnt = len(active_deals)
        if active_deals:
            avg_savings_pct = round(
                sum(d.discount_pct for d in active_deals) / len(active_deals), 1
            )
    else:
        savings_res = await session.execute(
            select(func.avg(DealCandidateModel.est_savings_cents)).where(
                DealCandidateModel.status == "verified"
            )
        )
        avg_cents = savings_res.scalar() or 0

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
    currency_param: str | None = Query(None, alias="currency"),
    session: AsyncSession = Depends(get_db),
    current_user: UserModel | None = Depends(get_optional_user),
):
    stmt = select(DealWatchAlertModel).order_by(
        DealWatchAlertModel.is_active.desc(), DealWatchAlertModel.created_at.desc()
    )
    res = await session.execute(stmt)
    alerts = res.scalars().all()

    user_currency = (
        _resolve_target_currency(currency_param, current_user, default="") or None
    )

    seen_corridors: set[tuple[str, str]] = set()
    items: list[RouteItemResponse] = []
    for a in alerts:
        dest_code = a.destinations[0] if a.destinations else ""
        corridor_key = (a.origin_iata.upper().strip(), dest_code.upper().strip())
        if corridor_key in seen_corridors:
            continue
        seen_corridors.add(corridor_key)
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
            depart_date=a.earliest_date or today,
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

        # Query lowest forward departure fare across the horizon
        fwd_min_stmt = select(func.min(PriceDailyModel.min_base)).where(
            PriceDailyModel.origin_iata == a.origin_iata,
            PriceDailyModel.destination_code == dest_code,
            PriceDailyModel.depart_date >= today,
        )
        fwd_min_res = await session.execute(fwd_min_stmt)
        fwd_min_cents = fwd_min_res.scalar()

        effective_current_cents = (
            fwd_min_cents
            if fwd_min_cents is not None
            else (latest_tick.base_price_cents if latest_tick else None)
        )
        current_eur = (
            round(effective_current_cents / 100.0, 2)
            if effective_current_cents is not None
            else None
        )
        lowest_eur = (
            round(min_cents / 100.0, 2) if min_cents is not None else current_eur
        )

        # Check corpus status
        c_status = await get_route_corpus_status(session, a.origin_iata, dest_code)
        corpus_state = c_status.get("status", "building")

        discount = None
        is_deal = False
        verdict_label = None
        verdict_pct = None

        if effective_current_cents and quantiles:
            pv = classify_price(effective_current_cents, quantiles, b_conf)
            verdict_label = pv.verdict
            verdict_pct = pv.percentile
            discount = pv.vs_median_pct if pv.vs_median_pct > 0 else None
            is_deal = pv.verdict in ("GREAT", "GOOD") or (
                p10_eur is not None
                and current_eur is not None
                and current_eur <= p10_eur
            )
        elif current_eur and p50_eur and current_eur < p50_eur:
            discount = round(((p50_eur - current_eur) / p50_eur) * 100, 1)
            if (p10_eur and current_eur <= p10_eur) or discount >= 30.0:
                is_deal = True

        status_label = (
            "PAUSED"
            if not a.is_active
            else ("DEAL" if is_deal else ("ACTIVE" if current_eur else "PENDING"))
        )

        target_curr = user_currency or a.currency or "EUR"
        budget_nominal = round(a.max_budget_cents / 100.0, 2)
        budget_disp = (
            _cvt_money(budget_nominal, target_curr)
            if (a.currency or "EUR") == "EUR"
            else budget_nominal
        )

        items.append(
            RouteItemResponse(
                id=a.id,
                origin_iata=a.origin_iata,
                destination_code=dest_code,
                destination_name=dest_name,
                earliest_date=a.earliest_date.isoformat() if a.earliest_date else None,
                latest_date=a.latest_date.isoformat() if a.latest_date else None,
                min_nights=a.min_nights,
                max_nights=a.max_nights,
                travelers=a.travelers or 1,
                participants=a.participants,
                max_budget_eur=budget_disp,
                currency=target_curr,
                is_active=a.is_active,
                schedule="Every 2h" if is_deal else "Daily",
                status=status_label,
                current_price_eur=_cvt_money(current_eur, target_curr),
                baseline_p50_eur=_cvt_money(p50_eur, target_curr),
                baseline_p10_eur=_cvt_money(p10_eur, target_curr),
                lowest_ever_eur=_cvt_money(lowest_eur, target_curr),
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
    e_date: date | None = None
    l_date: date | None = None
    if req.earliest_date and req.earliest_date.strip():
        try:
            e_date = date.fromisoformat(req.earliest_date.strip())
        except ValueError:
            raise HTTPException(
                status_code=400, detail="Invalid earliest_date format. Use YYYY-MM-DD"
            )
    if req.latest_date and req.latest_date.strip():
        try:
            l_date = date.fromisoformat(req.latest_date.strip())
        except ValueError:
            raise HTTPException(
                status_code=400, detail="Invalid latest_date format. Use YYYY-MM-DD"
            )
    if e_date and l_date and e_date > l_date:
        raise HTTPException(
            status_code=400,
            detail="earliest_date must be before or equal to latest_date",
        )

    target_currency = (
        (
            req.currency
            or (
                current_user.preferences.get("default_currency")
                if isinstance(current_user, UserModel) and current_user.preferences
                else None
            )
            or "EUR"
        )
        .upper()
        .strip()
    )

    travelers_count = (
        max(1, len(req.participants)) if req.participants else max(1, req.travelers)
    )

    from app.engine.market.flights.classifier import (
        route_classifier,
        UnknownAirportError,
    )

    try:
        route_classifier.classify_corridor(req.origin_iata, req.destination_code)
    except UnknownAirportError as e:
        raise HTTPException(status_code=400, detail=str(e))

    origin_code = req.origin_iata.upper().strip()
    dest_code = req.destination_code.upper().strip()

    # Prevent monitoring the exact same route twice
    existing_alerts_stmt = select(DealWatchAlertModel).filter(
        DealWatchAlertModel.origin_iata == origin_code
    )
    if user_id:
        existing_alerts_stmt = existing_alerts_stmt.filter(
            DealWatchAlertModel.user_id == user_id
        )
    existing_alerts_res = await session.execute(existing_alerts_stmt)
    for ea in existing_alerts_res.scalars().all():
        if dest_code in [d.upper().strip() for d in (ea.destinations or [])]:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=f"Route {origin_code} → {dest_code} is already being monitored.",
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
        travelers=travelers_count,
        participants=req.participants,
        bags_needed=0,
        max_budget_cents=int(round(req.max_budget_eur * 100)),
        currency=target_currency,
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
        today = datetime.now(timezone.utc).date()
        window_ticks = await ingest_flight_ticks(
            session=session,
            origin_iata=alert.origin_iata,
            dest_iata=alert.destinations[0],
            dest_code=alert.destinations[0],
            date_from=alert.earliest_date or today,
            date_to=(
                min(alert.earliest_date + timedelta(days=45), alert.latest_date)
                if alert.earliest_date and alert.latest_date
                else (alert.earliest_date or today) + timedelta(days=45)
            ),
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
        depart_date=alert.earliest_date or today,
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
        earliest_date=alert.earliest_date.isoformat() if alert.earliest_date else None,
        latest_date=alert.latest_date.isoformat() if alert.latest_date else None,
        min_nights=alert.min_nights,
        max_nights=alert.max_nights,
        travelers=alert.travelers or 1,
        participants=alert.participants,
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
    currency_param: str | None = Query(None, alias="currency"),
    session: AsyncSession = Depends(get_db),
    current_user: UserModel | None = Depends(get_optional_user),
):
    stmt = select(DealWatchAlertModel).where(DealWatchAlertModel.id == route_id)
    res = await session.execute(stmt)
    alert = res.scalar_one_or_none()
    if not alert:
        raise HTTPException(status_code=404, detail="Route not found")

    target_currency = _resolve_target_currency(
        currency_param, current_user, default=alert.currency or "EUR"
    )

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

    # Fetch return daily price rollups
    p_ret_stmt = (
        select(
            PriceDailyModel.bucket,
            func.min(PriceDailyModel.min_base).label("min_base"),
            func.sum(PriceDailyModel.n_ticks).label("n_ticks"),
            PriceDailyModel.source,
        )
        .where(
            PriceDailyModel.origin_iata == dest_code,
            PriceDailyModel.destination_code == alert.origin_iata,
            PriceDailyModel.bucket >= start_date,
        )
        .group_by(PriceDailyModel.bucket, PriceDailyModel.source)
        .order_by(PriceDailyModel.bucket.asc())
    )
    p_ret_res = await session.execute(p_ret_stmt)
    return_daily_records = p_ret_res.all()

    return_points: list[HistoryPoint] = []
    for d in return_daily_records:
        return_points.append(
            HistoryPoint(
                date=d.bucket.isoformat(),
                timestamp=f"{d.bucket.isoformat()}T12:00:00Z",
                min_price_eur=round(d.min_base / 100.0, 2),
                median_price_eur=round(d.min_base / 100.0, 2),
                ticks_count=d.n_ticks,
                carrier=d.source or "Ryanair",
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

    # Also fetch return forward departure curve (dest_code -> alert.origin_iata)
    fwd_ret_stmt = (
        select(
            PriceDailyModel.depart_date,
            func.min(PriceDailyModel.min_base).label("min_price"),
            PriceDailyModel.source,
        )
        .where(
            PriceDailyModel.origin_iata == dest_code,
            PriceDailyModel.destination_code == alert.origin_iata,
            PriceDailyModel.depart_date >= today,
        )
        .group_by(PriceDailyModel.depart_date, PriceDailyModel.source)
        .order_by(PriceDailyModel.depart_date.asc())
    )
    fwd_ret_res = await session.execute(fwd_ret_stmt)
    fwd_ret_dict = {row[0]: (row[1], row[2]) for row in fwd_ret_res.all()}

    # Resolve baseline quantiles for outbound
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

    # Resolve baseline quantiles for inbound
    ret_quantiles, _, _ = await resolve_route_baseline_quantiles(
        session=session,
        origin_iata=dest_code,
        destination_code=alert.origin_iata,
        depart_date=alert.earliest_date,
        observation_date=today,
    )
    inbound_p10 = (
        round(ret_quantiles["q10"] / 100.0, 2)
        if ret_quantiles and "q10" in ret_quantiles
        else None
    )
    inbound_p50 = (
        round(ret_quantiles["q50"] / 100.0, 2)
        if ret_quantiles and "q50" in ret_quantiles
        else None
    )
    inbound_p90 = (
        round(ret_quantiles["q90"] / 100.0, 2)
        if ret_quantiles and "q90" in ret_quantiles
        else None
    )

    outbound_dict = {row[0]: (row[1], row[2]) for row in fwd_rows}
    all_fwd_dates = sorted(set(outbound_dict.keys()) | set(fwd_ret_dict.keys()))

    forward_curve: list[ForwardPricePoint] = []
    for f_date in all_fwd_dates:
        out_entry = outbound_dict.get(f_date)
        ret_entry = fwd_ret_dict.get(f_date)

        out_price = round(out_entry[0] / 100.0, 2) if out_entry else None
        ret_price = round(ret_entry[0] / 100.0, 2) if ret_entry else None

        pv_label = None
        pv_pct = None
        if quantiles and out_entry:
            pv = classify_price(out_entry[0], quantiles, b_conf)
            pv_label = pv.verdict
            pv_pct = pv.percentile

        forward_curve.append(
            ForwardPricePoint(
                depart_date=f_date.isoformat(),
                price_eur=out_price if out_price is not None else (ret_price or 0.0),
                price_return_eur=ret_price,
                verdict=pv_label,
                percentile=pv_pct,
                carrier=out_entry[1] if out_entry else None,
                return_carrier=ret_entry[1] if ret_entry else None,
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
        f.price_eur for f in forward_curve if f.price_eur
    ]
    min_pt = min(all_prices) if all_prices else None

    # Fetch authentic destination lodging observations from database
    lodging_curve: list[LodgingPricePoint] = []

    # 1. Query rich hotel rate observations
    obs_stmt = (
        select(
            HotelRateObservationModel.check_in,
            func.min(HotelRateObservationModel.price_nightly_cents),
            func.avg(HotelRateObservationModel.price_nightly_cents),
            func.count(HotelRateObservationModel.id),
        )
        .where(
            HotelRateObservationModel.destination_code == dest_code,
            HotelRateObservationModel.check_in >= today,
        )
        .group_by(HotelRateObservationModel.check_in)
    )
    obs_rows = (await session.execute(obs_stmt)).all()
    obs_stats_by_date = {
        row[0]: {
            "min_cents": row[1],
            "avg_cents": row[2],
            "count": row[3],
        }
        for row in obs_rows
    }

    # Fetch top property details for dates with observations using taste-aware ranking
    best_props_by_date = {}
    if obs_rows:
        from collections import defaultdict
        from app.engine.market.lodging.ranking import HotelCandidate, rank_hotels

        city_stmt = (
            select(CityModel)
            .where(
                (CityModel.id == dest_code.upper())
                | (CityModel.country_code == dest_code.upper())
                | (CityModel.name.ilike(f"%{dest_code}%"))
            )
            .limit(1)
        )
        city_obj = (await session.execute(city_stmt)).scalar_one_or_none()
        center_lat = city_obj.center_lat if city_obj else None
        center_lon = city_obj.center_lon if city_obj else None

        user_prefs = (
            (current_user.preferences or {})
            if isinstance(current_user, UserModel) and current_user.preferences
            else {}
        )
        if not user_prefs and alert.user_id:
            u_row = await session.scalar(
                select(UserModel).where(UserModel.id == alert.user_id)
            )
            if u_row and u_row.preferences:
                user_prefs = u_row.preferences

        prop_stmt = (
            select(
                HotelRateObservationModel.check_in,
                HotelRateObservationModel.price_nightly_cents,
                HotelRateObservationModel.property_id,
                HotelPropertyModel.name,
                HotelPropertyModel.stars,
                HotelRateObservationModel.review_score,
                HotelRateObservationModel.review_count,
                HotelRateObservationModel.deep_link,
                HotelRateObservationModel.provider,
                HotelPropertyModel.latitude,
                HotelPropertyModel.longitude,
                HotelPropertyModel.property_type,
                HotelRateObservationModel.free_cancellation,
                HotelRateObservationModel.board,
                HotelRateObservationModel.taxes_included,
                HotelRateObservationModel.confidence,
            )
            .join(
                HotelPropertyModel,
                HotelPropertyModel.id == HotelRateObservationModel.property_id,
            )
            .where(
                HotelRateObservationModel.destination_code == dest_code,
                HotelRateObservationModel.check_in >= today,
            )
            .order_by(
                HotelRateObservationModel.check_in.asc(),
                HotelRateObservationModel.price_nightly_cents.asc(),
            )
        )
        p_res = await session.execute(prop_stmt)
        cands_by_date = defaultdict(list)
        for p_row in p_res.all():
            cin = p_row[0]
            cands_by_date[cin].append(
                HotelCandidate(
                    property_id=p_row[2],
                    name=p_row[3],
                    nightly_cents=p_row[1],
                    stars=float(p_row[4]) if p_row[4] else None,
                    review_score=float(p_row[5]) if p_row[5] is not None else None,
                    review_count=int(p_row[6]) if p_row[6] is not None else None,
                    deep_link=p_row[7],
                    provider=p_row[8],
                    latitude=float(p_row[9]) if p_row[9] is not None else None,
                    longitude=float(p_row[10]) if p_row[10] is not None else None,
                    property_type=p_row[11] or "hotel",
                    free_cancellation=p_row[12],
                    board=p_row[13],
                    taxes_included=p_row[14] if p_row[14] is not None else True,
                    confidence=p_row[15] or "high",
                )
            )

        for cin, cand_list in cands_by_date.items():
            ranked = rank_hotels(
                cand_list,
                user_preferences=user_prefs,
                center_lat=center_lat,
                center_lon=center_lon,
            )
            if ranked:
                best = ranked[0]
                best_props_by_date[cin] = {
                    "nightly_cents": best.candidate.nightly_cents,
                    "property_id": best.candidate.property_id,
                    "name": best.candidate.name,
                    "stars": int(best.candidate.stars)
                    if best.candidate.stars
                    else None,
                    "review_score": best.candidate.review_score,
                    "review_count": best.candidate.review_count,
                    "deep_link": best.candidate.deep_link,
                    "provider": best.candidate.provider,
                    "value_score": best.value_score,
                    "badge": best.badge,
                }

    # Also fallback to existing market_price_ticks if older scan ticks exist
    db_l_stmt = (
        select(MarketPriceTickModel)
        .where(
            MarketPriceTickModel.destination_code == dest_code,
            MarketPriceTickModel.asset_type == "lodging",
            MarketPriceTickModel.depart_date >= today,
        )
        .order_by(MarketPriceTickModel.depart_date.asc())
    )
    db_l_ticks = (await session.execute(db_l_stmt)).scalars().all()
    db_l_by_date = {}
    for t in db_l_ticks:
        if t.depart_date not in db_l_by_date:
            meta = t.metadata_json or {}
            db_l_by_date[t.depart_date] = {
                "nightly_cents": t.base_price_cents,
                "property_id": meta.get("property_id"),
                "name": meta.get("property_name"),
                "stars": int(meta["stars"]) if meta.get("stars") else None,
                "review_score": meta.get("review_score"),
                "review_count": meta.get("review_count"),
                "deep_link": meta.get("deep_link"),
                "provider": t.source,
            }

    stay_n = alert.min_nights or 3
    for f_date in all_fwd_dates:
        if f_date in best_props_by_date:
            bp = best_props_by_date[f_date]
            stat = obs_stats_by_date.get(f_date, {})
            rate_val = round(float(bp["nightly_cents"]) / 100.0, 2)
            med_val = round(
                float(stat.get("avg_cents") or bp["nightly_cents"]) / 100.0, 2
            )
            lodging_curve.append(
                LodgingPricePoint(
                    date=f_date.isoformat(),
                    nightly_price_eur=rate_val,
                    total_stay_eur=round(rate_val * stay_n, 2),
                    property_name=bp["name"],
                    property_id=bp["property_id"],
                    stars=bp["stars"],
                    review_score=bp["review_score"],
                    review_count=bp["review_count"],
                    booking_url=bp["deep_link"],
                    source=bp["provider"],
                    min_eur=rate_val,
                    median_eur=med_val,
                    n_properties=stat.get("count", 1),
                    value_score=bp.get("value_score"),
                    badge=bp.get("badge"),
                )
            )
        elif f_date in db_l_by_date:
            lp = db_l_by_date[f_date]
            rate_val = round(float(lp["nightly_cents"]) / 100.0, 2)
            lodging_curve.append(
                LodgingPricePoint(
                    date=f_date.isoformat(),
                    nightly_price_eur=rate_val,
                    total_stay_eur=round(rate_val * stay_n, 2),
                    property_name=lp["name"],
                    property_id=lp["property_id"],
                    stars=lp["stars"],
                    review_score=lp["review_score"],
                    review_count=lp["review_count"],
                    booking_url=lp["deep_link"],
                    source=lp["provider"],
                    min_eur=rate_val,
                    median_eur=rate_val,
                    n_properties=1,
                )
            )
        else:
            # ZERO fake data: do NOT rotate day % len and do NOT fake with 0.0
            lodging_curve.append(
                LodgingPricePoint(
                    date=f_date.isoformat(),
                    nightly_price_eur=None,
                    total_stay_eur=None,
                    property_name=None,
                    source="none",
                    n_properties=0,
                )
            )

    if target_currency != "EUR":
        points = [
            HistoryPoint(
                date=p.date,
                timestamp=p.timestamp,
                min_price_eur=_cvt_money(p.min_price_eur, target_currency) or 0.0,
                median_price_eur=_cvt_money(p.median_price_eur, target_currency) or 0.0,
                ticks_count=p.ticks_count,
                carrier=p.carrier,
            )
            for p in points
        ]
        return_points = [
            HistoryPoint(
                date=p.date,
                timestamp=p.timestamp,
                min_price_eur=_cvt_money(p.min_price_eur, target_currency) or 0.0,
                median_price_eur=_cvt_money(p.median_price_eur, target_currency) or 0.0,
                ticks_count=p.ticks_count,
                carrier=p.carrier,
            )
            for p in return_points
        ]
        forward_curve = [
            ForwardPricePoint(
                depart_date=f.depart_date,
                price_eur=_cvt_money(f.price_eur, target_currency) or 0.0,
                price_return_eur=_cvt_money(f.price_return_eur, target_currency),
                verdict=f.verdict,
                percentile=f.percentile,
                carrier=f.carrier,
                return_carrier=f.return_carrier,
            )
            for f in forward_curve
        ]
        lodging_curve = [
            LodgingPricePoint(
                date=lc.date,
                nightly_price_eur=_cvt_money(lc.nightly_price_eur, target_currency),
                total_stay_eur=_cvt_money(lc.total_stay_eur, target_currency),
                property_name=lc.property_name,
                property_id=lc.property_id,
                stars=lc.stars,
                review_score=lc.review_score,
                review_count=lc.review_count,
                booking_url=lc.booking_url,
                source=lc.source,
                min_eur=_cvt_money(lc.min_eur, target_currency),
                median_eur=_cvt_money(lc.median_eur, target_currency),
                p25_eur=_cvt_money(lc.p25_eur, target_currency),
                p75_eur=_cvt_money(lc.p75_eur, target_currency),
                n_properties=lc.n_properties,
                coverage_ratio=lc.coverage_ratio,
            )
            for lc in lodging_curve
        ]
        p10 = _cvt_money(p10, target_currency)
        p25 = _cvt_money(p25, target_currency)
        p50 = _cvt_money(p50, target_currency)
        p75 = _cvt_money(p75, target_currency)
        p90 = _cvt_money(p90, target_currency)
        inbound_p10 = _cvt_money(inbound_p10, target_currency)
        inbound_p50 = _cvt_money(inbound_p50, target_currency)
        inbound_p90 = _cvt_money(inbound_p90, target_currency)
        min_pt = _cvt_money(min_pt, target_currency)

    return HistoryResponse(
        points=points,
        return_points=return_points,
        forward_curve=forward_curve,
        lodging_curve=lodging_curve,
        p10_deal_eur=p10,
        p25_eur=p25,
        p50_median_eur=p50,
        p75_eur=p75,
        p90_peak_eur=p90,
        inbound_p10_deal_eur=inbound_p10,
        inbound_p50_median_eur=inbound_p50,
        inbound_p90_peak_eur=inbound_p90,
        lowest_ever_eur=min_pt,
        verdict=verdict_dict,
        corpus=corpus_info,
        currency=target_currency,
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
    try:
        from app.tasks import prewarm_route_lodging_task

        prewarm_route_lodging_task.delay(alert.origin_iata, dest_code, top_n=5)
    except Exception as ex:
        logger.warning(f"Could not enqueue prewarm_route_lodging_task: {ex}")
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


@router.get("/routes/{route_id}/lodging", response_model=LodgingSummary)
async def get_route_lodging_for_date(
    route_id: str,
    check_in: date = Query(..., description="Check-in date (YYYY-MM-DD)"),
    nights: int = Query(3, ge=1, le=14, description="Stay duration in nights"),
    adults: int | None = Query(None, ge=1, le=16, description="Number of guests"),
    currency_param: str | None = Query(None, alias="currency"),
    session: AsyncSession = Depends(get_db),
    current_user: UserModel | None = Depends(get_optional_user),
):
    """
    On-demand hotel observation endpoint for a specific route and travel date.
    Strictly zero synthetic or mock data:
    1. First queries database for authentic hotel rate observations.
    2. If not yet observed, dispatches live multi-provider ingestion (Booking/Google Travel),
       persists quotes, and returns the authentic best offer.
    """
    stmt = select(DealWatchAlertModel).where(DealWatchAlertModel.id == route_id)
    res = await session.execute(stmt)
    alert = res.scalar_one_or_none()
    if not alert:
        raise HTTPException(status_code=404, detail="Route not found")

    target_currency = _resolve_target_currency(
        currency_param, current_user, default=alert.currency or "EUR"
    )

    dest_code = alert.destinations[0] if alert.destinations else ""
    if not dest_code:
        raise HTTPException(status_code=400, detail="Route has no destination code")

    def _build_lodging_summary(
        nightly_cents_val: int | float,
        p_name: str | None,
        p_stars: int | None,
        r_score: float | None,
        r_count: int | None,
        b_url: str | None,
        src: str | None,
        val_score: float | None = None,
        badge_str: str | None = None,
        reasons: list[str] | None = None,
    ) -> LodgingSummary:
        raw_eur = round(float(nightly_cents_val) / 100.0, 2)
        converted_nightly = _cvt_money(raw_eur, target_currency) or raw_eur
        return LodgingSummary(
            nights=nights,
            price_per_night_eur=converted_nightly,
            total_lodging_eur=round(converted_nightly * nights, 2),
            property_name=p_name,
            stars=p_stars,
            review_score=r_score,
            review_count=r_count,
            booking_url=b_url,
            source=src,
            currency=target_currency,
            value_score=val_score,
            badge=badge_str,
            rank_reasons=reasons or [],
        )

    # 1. Query existing authentic hotel rate observations for this destination & check_in
    from app.engine.market.lodging.ranking import HotelCandidate, rank_hotels

    user_prefs = (
        (current_user.preferences or {})
        if isinstance(current_user, UserModel) and current_user.preferences
        else {}
    )
    if not user_prefs and alert.user_id:
        u_row = await session.scalar(
            select(UserModel).where(UserModel.id == alert.user_id)
        )
        if u_row and u_row.preferences:
            user_prefs = u_row.preferences

    city_stmt = (
        select(CityModel)
        .where(
            (CityModel.id == dest_code.upper())
            | (CityModel.country_code == dest_code.upper())
            | (CityModel.name.ilike(f"%{dest_code}%"))
        )
        .limit(1)
    )
    city_obj = (await session.execute(city_stmt)).scalar_one_or_none()
    center_lat = city_obj.center_lat if city_obj else None
    center_lon = city_obj.center_lon if city_obj else None

    obs_stmt = (
        select(
            HotelRateObservationModel.price_nightly_cents,
            HotelPropertyModel.name,
            HotelPropertyModel.stars,
            HotelRateObservationModel.review_score,
            HotelRateObservationModel.review_count,
            HotelRateObservationModel.deep_link,
            HotelRateObservationModel.provider,
            HotelPropertyModel.id,
            HotelPropertyModel.latitude,
            HotelPropertyModel.longitude,
            HotelPropertyModel.property_type,
            HotelRateObservationModel.free_cancellation,
            HotelRateObservationModel.board,
            HotelRateObservationModel.taxes_included,
            HotelRateObservationModel.confidence,
        )
        .join(
            HotelPropertyModel,
            HotelPropertyModel.id == HotelRateObservationModel.property_id,
        )
        .where(
            HotelRateObservationModel.destination_code == dest_code,
            HotelRateObservationModel.check_in == check_in,
        )
        .order_by(HotelRateObservationModel.price_nightly_cents.asc())
    )
    obs_rows = (await session.execute(obs_stmt)).all()
    if obs_rows:
        candidates = [
            HotelCandidate(
                property_id=r[7],
                name=r[1],
                nightly_cents=r[0],
                stars=float(r[2]) if r[2] else None,
                review_score=float(r[3]) if r[3] is not None else None,
                review_count=int(r[4]) if r[4] is not None else None,
                deep_link=r[5],
                provider=r[6],
                latitude=float(r[8]) if r[8] is not None else None,
                longitude=float(r[9]) if r[9] is not None else None,
                property_type=r[10] or "hotel",
                free_cancellation=r[11],
                board=r[12],
                taxes_included=r[13] if r[13] is not None else True,
                confidence=r[14] or "high",
            )
            for r in obs_rows
        ]
        ranked = rank_hotels(
            candidates,
            user_preferences=user_prefs,
            center_lat=center_lat,
            center_lon=center_lon,
        )
        if ranked:
            best = ranked[0]
            return _build_lodging_summary(
                best.candidate.nightly_cents,
                best.candidate.name,
                int(best.candidate.stars) if best.candidate.stars else None,
                best.candidate.review_score,
                best.candidate.review_count,
                best.candidate.deep_link,
                best.candidate.provider,
                val_score=best.value_score,
                badge_str=best.badge,
                reasons=best.rank_reasons,
            )

    # 2. Also check market_price_ticks if tick exists
    t_stmt = (
        select(MarketPriceTickModel)
        .where(
            MarketPriceTickModel.destination_code == dest_code,
            MarketPriceTickModel.asset_type == "lodging",
            MarketPriceTickModel.depart_date == check_in,
        )
        .order_by(MarketPriceTickModel.base_price_cents.asc())
        .limit(1)
    )
    t_row = (await session.execute(t_stmt)).scalar_one_or_none()
    if t_row:
        meta = t_row.metadata_json or {}
        return _build_lodging_summary(
            t_row.base_price_cents,
            meta.get("property_name"),
            int(meta["stars"]) if meta.get("stars") else None,
            float(meta["review_score"])
            if meta.get("review_score") is not None
            else None,
            int(meta["review_count"]) if meta.get("review_count") is not None else None,
            meta.get("deep_link"),
            t_row.source,
            badge_str="cheapest",
            reasons=["Tick baseline estimate"],
        )

    # 3. Live on-demand multi-provider ingest if no observations cached
    from app.engine.market.adapters import OpenLodgingFeed
    from app.engine.market.ingest import ingest_lodging_ticks

    feed = OpenLodgingFeed(timeout_sec=10.0)
    check_out = check_in + timedelta(days=nights)
    try:
        await ingest_lodging_ticks(
            session=session,
            destination_code=dest_code,
            check_in=check_in,
            check_out=check_out,
            feed=feed,
        )
    except Exception as e:
        logger.warning(
            f"[OnDemandLodging] Live ingest failed for {dest_code} {check_in}: {e}"
        )

    # Re-query after ingestion
    obs_rows_after = (await session.execute(obs_stmt)).all()
    if obs_rows_after:
        candidates_after = [
            HotelCandidate(
                property_id=r[7],
                name=r[1],
                nightly_cents=r[0],
                stars=float(r[2]) if r[2] else None,
                review_score=float(r[3]) if r[3] is not None else None,
                review_count=int(r[4]) if r[4] is not None else None,
                deep_link=r[5],
                provider=r[6],
                latitude=float(r[8]) if r[8] is not None else None,
                longitude=float(r[9]) if r[9] is not None else None,
                property_type=r[10] or "hotel",
                free_cancellation=r[11],
                board=r[12],
                taxes_included=r[13] if r[13] is not None else True,
                confidence=r[14] or "high",
            )
            for r in obs_rows_after
        ]
        ranked_after = rank_hotels(
            candidates_after,
            user_preferences=user_prefs,
            center_lat=center_lat,
            center_lon=center_lon,
        )
        if ranked_after:
            best = ranked_after[0]
            return _build_lodging_summary(
                best.candidate.nightly_cents,
                best.candidate.name,
                int(best.candidate.stars) if best.candidate.stars else None,
                best.candidate.review_score,
                best.candidate.review_count,
                best.candidate.deep_link,
                best.candidate.provider,
                val_score=best.value_score,
                badge_str=best.badge,
                reasons=best.rank_reasons,
            )

    # ZERO synthetic data fallback: raise 404 if no authentic provider data could be fetched
    raise HTTPException(
        status_code=404,
        detail=f"No authentic lodging observations obtainable for destination {dest_code} on {check_in}",
    )


async def _fetch_corridor_quotes(
    origin: str,
    dest: str,
    date_from: date,
    date_to: date,
    feed: CompositeFlightFeed,
    session: AsyncSession,
) -> dict[str, dict[str, Any]]:
    quotes_by_date: dict[str, dict[str, Any]] = {}
    now = datetime.now(timezone.utc)
    try:
        live = await feed.fetch_cached_flights(
            origin_iata=origin,
            dest_iata=dest,
            date_from=date_from,
            date_to=date_to,
        )
        for q in live:
            d_str = q.depart_time.date().isoformat()
            fare = round(q.base_price_cents / 100.0, 2)
            if d_str not in quotes_by_date or fare < quotes_by_date[d_str]["price_eur"]:
                quotes_by_date[d_str] = {
                    "price_eur": fare,
                    "flight_number": q.flight_number,
                    "duration_mins": int(
                        (q.arrival_time - q.depart_time).total_seconds() // 60
                    ),
                    "departure_time": q.depart_time.strftime("%H:%M"),
                    "booking_url": q.deep_link
                    or f"https://www.google.com/travel/flights?q=Flights+from+{origin}+to+{dest}+on+{d_str}",
                    "carrier": q.carrier,
                }
    except Exception as e:
        logger.warning(
            f"Could not fetch live quotes for corridor {origin}->{dest}: {e}"
        )

    # Also query stored ticks from DB for days not returned by live feed
    stored_ticks_stmt = select(MarketPriceTickModel).where(
        MarketPriceTickModel.origin_iata == origin,
        MarketPriceTickModel.destination_code == dest,
        MarketPriceTickModel.depart_date >= now.date(),
    )
    stored_res = await session.execute(stored_ticks_stmt)
    stored_ticks = stored_res.scalars().all()
    for st in stored_ticks:
        d_str = st.depart_date.isoformat()
        fare = round(st.base_price_cents / 100.0, 2)
        if d_str not in quotes_by_date or fare < quotes_by_date[d_str]["price_eur"]:
            st_meta = st.metadata_json or {}
            quotes_by_date[d_str] = {
                "price_eur": fare,
                "flight_number": st_meta.get("flight_number"),
                "duration_mins": None,
                "departure_time": None,
                "booking_url": st_meta.get("deep_link")
                or f"https://www.google.com/travel/flights?q=Flights+from+{origin}+to+{dest}+on+{d_str}",
                "carrier": st.source,
            }
    return quotes_by_date


@router.get("/routes/{route_id}/calendar", response_model=CalendarResponse)
async def get_route_calendar(
    route_id: str,
    months_count: int = Query(4, ge=1, le=12, alias="months"),
    view: str = Query("roundtrip", pattern="^(outbound|inbound|roundtrip)$"),
    pricing: str = Query("package", pattern="^(flights|package)$"),
    currency_param: str | None = Query(None, alias="currency"),
    session: AsyncSession = Depends(get_db),
    current_user: UserModel | None = Depends(get_optional_user),
):
    stmt = select(DealWatchAlertModel).where(DealWatchAlertModel.id == route_id)
    res = await session.execute(stmt)
    alert = res.scalar_one_or_none()
    if not alert:
        raise HTTPException(status_code=404, detail="Route not found")

    target_currency = _resolve_target_currency(
        currency_param, current_user, default=alert.currency or "EUR"
    )

    dest_code = alert.destinations[0]
    dest_name = await _resolve_city_name(session, dest_code)

    # Restrict horizon within valid bounds [1, CORPUS_HORIZON_MONTHS]
    effective_months = min(max(months_count, 1), CORPUS_HORIZON_MONTHS)

    now = datetime.now(timezone.utc)
    curr_year = now.year
    curr_month = now.month

    # Baseline resolution (use drop_month aggregated baseline for corridor, fallback to alert baseline)
    base_stmt = (
        select(RouteBaselineModel)
        .where(
            RouteBaselineModel.origin_iata == alert.origin_iata,
            RouteBaselineModel.destination_code == dest_code,
            RouteBaselineModel.level == "drop_month",
            RouteBaselineModel.depart_month == 0,
        )
        .order_by(RouteBaselineModel.n_rows.desc())
        .limit(1)
    )
    base_res = await session.execute(base_stmt)
    baseline = base_res.scalar_one_or_none()
    if not baseline:
        fb_stmt = (
            select(RouteBaselineModel)
            .where(
                RouteBaselineModel.origin_iata == alert.origin_iata,
                RouteBaselineModel.destination_code == dest_code,
            )
            .order_by(RouteBaselineModel.n_rows.desc())
            .limit(1)
        )
        base_res = await session.execute(fb_stmt)
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
    p90 = (
        round(float(baseline.q90) / 100.0, 2)
        if baseline and baseline.q90 is not None
        else (round(p50 * 1.5, 2) if p50 else None)
    )

    ret_base_stmt = (
        select(RouteBaselineModel)
        .where(
            RouteBaselineModel.origin_iata == dest_code,
            RouteBaselineModel.destination_code == alert.origin_iata,
            RouteBaselineModel.level == "drop_month",
            RouteBaselineModel.depart_month == 0,
        )
        .order_by(RouteBaselineModel.n_rows.desc())
        .limit(1)
    )
    ret_base_res = await session.execute(ret_base_stmt)
    ret_baseline = ret_base_res.scalar_one_or_none()
    if not ret_baseline:
        fb_ret_stmt = (
            select(RouteBaselineModel)
            .where(
                RouteBaselineModel.origin_iata == dest_code,
                RouteBaselineModel.destination_code == alert.origin_iata,
            )
            .order_by(RouteBaselineModel.n_rows.desc())
            .limit(1)
        )
        ret_base_res = await session.execute(fb_ret_stmt)
        ret_baseline = ret_base_res.scalar_one_or_none()

    inbound_p10 = (
        round(float(ret_baseline.q10) / 100.0, 2)
        if ret_baseline and ret_baseline.q10 is not None
        else p10
    )
    inbound_p50 = (
        round(float(ret_baseline.q50) / 100.0, 2)
        if ret_baseline and ret_baseline.q50 is not None
        else p50
    )
    inbound_p90 = (
        round(float(ret_baseline.q90) / 100.0, 2)
        if ret_baseline and ret_baseline.q90 is not None
        else (round(inbound_p50 * 1.5, 2) if inbound_p50 else p90)
    )

    feed = CompositeFlightFeed()
    today = datetime.now(timezone.utc).date()
    date_from = alert.earliest_date or today
    horizon_days = effective_months * 31
    date_to = (
        max(alert.latest_date, date_from + timedelta(days=horizon_days))
        if alert.latest_date
        else date_from + timedelta(days=horizon_days)
    )

    # Fetch quotes according to requested view
    outbound_quotes: dict[str, dict[str, Any]] = {}
    inbound_quotes: dict[str, dict[str, Any]] = {}

    if view in ("outbound", "roundtrip"):
        outbound_quotes = await _fetch_corridor_quotes(
            origin=alert.origin_iata,
            dest=dest_code,
            date_from=date_from,
            date_to=date_to,
            feed=feed,
            session=session,
        )

    if view in ("inbound", "roundtrip"):
        inbound_quotes = await _fetch_corridor_quotes(
            origin=dest_code,
            dest=alert.origin_iata,
            date_from=date_from,
            date_to=date_to,
            feed=feed,
            session=session,
        )

    # If package pricing, estimate lodging benchmark per night
    hotel_rate_eur = 0.0
    if view == "roundtrip" and pricing == "package":
        lodging_median, _, _ = await resolve_baseline_median(
            session, "lodging", "", dest_code, alert.earliest_date, now.date(), "EUR"
        )
        if lodging_median:
            hotel_rate_eur = round(float(lodging_median) / 100.0, 2)
        else:
            avg_obs_stmt = select(
                func.avg(HotelRateObservationModel.price_nightly_cents)
            ).where(
                HotelRateObservationModel.destination_code == dest_code,
                HotelRateObservationModel.check_in >= now.date(),
            )
            avg_cents = await session.scalar(avg_obs_stmt)
            if avg_cents is not None:
                hotel_rate_eur = round(float(avg_cents) / 100.0, 2)
            else:
                tick_stmt = select(
                    func.avg(MarketPriceTickModel.base_price_cents)
                ).where(
                    MarketPriceTickModel.destination_code == dest_code,
                    MarketPriceTickModel.asset_type == "lodging",
                    MarketPriceTickModel.depart_date >= now.date(),
                )
                tick_avg = await session.scalar(tick_stmt)
                if tick_avg is not None:
                    hotel_rate_eur = round(float(tick_avg) / 100.0, 2)
                else:
                    hotel_rate_eur = 0.0

    # Effective quantiles for tiering
    cal_travelers = getattr(alert, "travelers", 1) or 1
    if view == "roundtrip":
        effective_p10 = (
            ((p10 or 0) * cal_travelers)
            + ((inbound_p10 or p10 or 0) * cal_travelers)
            + (hotel_rate_eur * alert.min_nights if pricing == "package" else 0)
        ) or None
        effective_p50 = (
            ((p50 or 0) * cal_travelers)
            + ((inbound_p50 or p50 or 0) * cal_travelers)
            + (hotel_rate_eur * alert.min_nights if pricing == "package" else 0)
        ) or None
        effective_p90 = (
            ((p90 or 0) * cal_travelers)
            + ((inbound_p90 or p90 or 0) * cal_travelers)
            + (hotel_rate_eur * alert.min_nights if pricing == "package" else 0)
        ) or None
        route_label = f"{alert.origin_iata} ⇄ {dest_name} ({dest_code}) · {alert.min_nights}-{alert.max_nights}N"
    elif view == "inbound":
        effective_p10 = (
            ((inbound_p10 or p10) * cal_travelers) if (inbound_p10 or p10) else None
        )
        effective_p50 = (
            ((inbound_p50 or p50) * cal_travelers) if (inbound_p50 or p50) else None
        )
        effective_p90 = (
            ((inbound_p90 or p90) * cal_travelers) if (inbound_p90 or p90) else None
        )
        route_label = f"{dest_name} ({dest_code}) → {alert.origin_iata}"
    else:
        effective_p10 = (p10 * cal_travelers) if p10 else None
        effective_p50 = (p50 * cal_travelers) if p50 else None
        effective_p90 = (p90 * cal_travelers) if p90 else None
        route_label = f"{alert.origin_iata} → {dest_name} ({dest_code})"

    months_list: list[CalendarMonthItem] = []
    for m_offset in range(effective_months):
        target_month = (curr_month - 1 + m_offset) % 12 + 1
        target_year = curr_year + ((curr_month - 1 + m_offset) // 12)
        num_days = calendar.monthrange(target_year, target_month)[1]
        m_name = calendar.month_name[target_month]

        days_list: list[CalendarDayItem] = []
        for d in range(1, num_days + 1):
            day_date = date(target_year, target_month, d)
            date_str = day_date.isoformat()
            weekday = day_date.weekday()

            if view == "roundtrip":
                # Check outbound departure on day_date and pair with cheapest return in [min_nights, max_nights]
                if date_str in outbound_quotes:
                    out_q = outbound_quotes[date_str]
                    best_total = None
                    best_ret_date_str = None
                    best_nights = None
                    best_ret_q = None

                    for n in range(alert.min_nights, alert.max_nights + 1):
                        cand_ret_date = day_date + timedelta(days=n)
                        cand_ret_str = cand_ret_date.isoformat()
                        if cand_ret_str in inbound_quotes:
                            in_q = inbound_quotes[cand_ret_str]
                            flight_part = (
                                out_q["price_eur"] + in_q["price_eur"]
                            ) * cal_travelers
                            total_fare = flight_part
                            if pricing == "package":
                                total_fare += hotel_rate_eur * n

                            if best_total is None or total_fare < best_total:
                                best_total = round(total_fare, 2)
                                best_ret_date_str = cand_ret_str
                                best_nights = n
                                best_ret_q = in_q

                    if (
                        best_total is not None
                        and best_ret_q is not None
                        and best_nights is not None
                    ):
                        price = best_total
                        night_hotel = (
                            (hotel_rate_eur * best_nights)
                            if pricing == "package"
                            else 0.0
                        )
                        day_p10 = (
                            ((p10 or 0) * cal_travelers)
                            + ((inbound_p10 or p10 or 0) * cal_travelers)
                            + night_hotel
                        ) or None
                        day_p50 = (
                            ((p50 or 0) * cal_travelers)
                            + ((inbound_p50 or p50 or 0) * cal_travelers)
                            + night_hotel
                        ) or None
                        day_p90 = (
                            ((p90 or 0) * cal_travelers)
                            + ((inbound_p90 or p90 or 0) * cal_travelers)
                            + night_hotel
                        ) or None

                        if day_p10 and price <= day_p10:
                            tier = "deal"
                        elif day_p50 and price <= day_p50:
                            tier = "fair"
                        elif day_p90 and price <= day_p90:
                            tier = "standard"
                        else:
                            tier = "peak"

                        days_list.append(
                            CalendarDayItem(
                                date=date_str,
                                day=d,
                                weekday=weekday,
                                price_eur=price,
                                price_tier=tier,
                                carrier=out_q["carrier"],
                                flight_number=out_q["flight_number"],
                                duration_mins=out_q["duration_mins"],
                                departure_time=out_q["departure_time"],
                                booking_url=out_q["booking_url"],
                                is_holiday=weekday == 6,
                                nights=best_nights,
                                return_date=best_ret_date_str,
                                outbound_flight=FlightSummary(
                                    carrier=out_q["carrier"],
                                    flight_number=out_q["flight_number"],
                                    duration_mins=out_q["duration_mins"],
                                    departure_time=out_q["departure_time"],
                                    booking_url=out_q["booking_url"],
                                    price_eur=round(
                                        out_q["price_eur"] * cal_travelers, 2
                                    ),
                                ),
                                return_flight=FlightSummary(
                                    carrier=best_ret_q["carrier"],
                                    flight_number=best_ret_q["flight_number"],
                                    duration_mins=best_ret_q["duration_mins"],
                                    departure_time=best_ret_q["departure_time"],
                                    booking_url=best_ret_q["booking_url"],
                                    price_eur=round(
                                        best_ret_q["price_eur"] * cal_travelers, 2
                                    ),
                                ),
                                lodging=LodgingSummary(
                                    nights=best_nights,
                                    price_per_night_eur=hotel_rate_eur,
                                    total_lodging_eur=round(
                                        hotel_rate_eur * best_nights, 2
                                    ),
                                )
                                if pricing == "package"
                                else None,
                            )
                        )
                    else:
                        days_list.append(
                            CalendarDayItem(
                                date=date_str,
                                day=d,
                                weekday=weekday,
                                price_eur=None,
                                price_tier="no_data",
                                carrier=None,
                                flight_number=None,
                                duration_mins=None,
                                departure_time=None,
                                booking_url=None,
                                is_holiday=weekday == 6,
                            )
                        )
                else:
                    days_list.append(
                        CalendarDayItem(
                            date=date_str,
                            day=d,
                            weekday=weekday,
                            price_eur=None,
                            price_tier="no_data",
                            carrier=None,
                            flight_number=None,
                            duration_mins=None,
                            departure_time=None,
                            booking_url=None,
                            is_holiday=weekday == 6,
                        )
                    )
            else:
                # One-way view (outbound or inbound)
                active_quotes = inbound_quotes if view == "inbound" else outbound_quotes
                eff_p10 = (inbound_p10 if view == "inbound" else p10) or None
                eff_p50 = (inbound_p50 if view == "inbound" else p50) or None
                eff_p90 = (inbound_p90 if view == "inbound" else p90) or None
                if eff_p10:
                    eff_p10 = round(eff_p10 * cal_travelers, 2)
                if eff_p50:
                    eff_p50 = round(eff_p50 * cal_travelers, 2)
                if eff_p90:
                    eff_p90 = round(eff_p90 * cal_travelers, 2)

                if date_str in active_quotes:
                    q = active_quotes[date_str]
                    price = round(q["price_eur"] * cal_travelers, 2)
                    if eff_p10 and price <= eff_p10:
                        tier = "deal"
                    elif eff_p50 and price <= eff_p50:
                        tier = "fair"
                    elif eff_p90 and price <= eff_p90:
                        tier = "standard"
                    else:
                        tier = "peak"

                    days_list.append(
                        CalendarDayItem(
                            date=date_str,
                            day=d,
                            weekday=weekday,
                            price_eur=price,
                            price_tier=tier,
                            carrier=q["carrier"],
                            flight_number=q["flight_number"],
                            duration_mins=q["duration_mins"],
                            departure_time=q["departure_time"],
                            booking_url=q["booking_url"],
                            is_holiday=weekday == 6,
                            outbound_flight=FlightSummary(
                                carrier=q["carrier"],
                                flight_number=q["flight_number"],
                                duration_mins=q["duration_mins"],
                                departure_time=q["departure_time"],
                                booking_url=q["booking_url"],
                                price_eur=price,
                            ),
                        )
                    )
                else:
                    days_list.append(
                        CalendarDayItem(
                            date=date_str,
                            day=d,
                            weekday=weekday,
                            price_eur=None,
                            price_tier="no_data",
                            carrier=None,
                            flight_number=None,
                            duration_mins=None,
                            departure_time=None,
                            booking_url=None,
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

    # Identify top 3 best packages across all months in the calendar horizon
    valid_days = [
        (day.price_eur, day.date)
        for m in months_list
        for day in m.days
        if day.price_eur is not None
    ]
    valid_days.sort(key=lambda x: x[0])
    top_dates = [x[1] for x in valid_days[:3]]

    if target_currency != "EUR":
        effective_p10 = _cvt_money(effective_p10, target_currency)
        effective_p50 = _cvt_money(effective_p50, target_currency)
        effective_p90 = _cvt_money(effective_p90, target_currency)
        for m in months_list:
            for day in m.days:
                day.price_eur = _cvt_money(day.price_eur, target_currency)
                if day.outbound_flight and day.outbound_flight.price_eur is not None:
                    day.outbound_flight.price_eur = _cvt_money(
                        day.outbound_flight.price_eur, target_currency
                    )
                if day.return_flight and day.return_flight.price_eur is not None:
                    day.return_flight.price_eur = _cvt_money(
                        day.return_flight.price_eur, target_currency
                    )
                if day.lodging:
                    day.lodging.price_per_night_eur = (
                        _cvt_money(day.lodging.price_per_night_eur, target_currency)
                        or 0.0
                    )
                    day.lodging.total_lodging_eur = (
                        _cvt_money(day.lodging.total_lodging_eur, target_currency)
                        or 0.0
                    )

    return CalendarResponse(
        months=months_list,
        route_label=route_label,
        p10_deal_eur=effective_p10,
        p50_median_eur=effective_p50,
        p90_peak_eur=effective_p90,
        view=view,
        pricing=pricing,
        top_dates=top_dates,
        currency=target_currency,
    )


@router.get("/routes/{route_id}/stats", response_model=RouteStatsResponse)
async def get_route_stats(
    route_id: str,
    currency_param: str | None = Query(None, alias="currency"),
    session: AsyncSession = Depends(get_db),
    current_user: UserModel | None = Depends(get_optional_user),
):
    stmt = select(DealWatchAlertModel).where(DealWatchAlertModel.id == route_id)
    res = await session.execute(stmt)
    alert = res.scalar_one_or_none()
    if not alert:
        raise HTTPException(status_code=404, detail="Route not found")

    target_currency = _resolve_target_currency(
        currency_param, current_user, default=alert.currency or "EUR"
    )

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

    if target_currency != "EUR":
        curr_eur = _cvt_money(curr_eur, target_currency)
        lowest_eur = _cvt_money(lowest_eur, target_currency)
        p10 = _cvt_money(p10, target_currency)
        p25 = _cvt_money(p25, target_currency)
        p50 = _cvt_money(p50, target_currency)
        p75 = _cvt_money(p75, target_currency)
        p90 = _cvt_money(p90, target_currency)
        savings = _cvt_money(savings, target_currency)

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
        currency=target_currency,
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
    raw = await deal_package_service.format_deal_event(session, ev)
    if not raw:
        return None
    return DealPackageItem(**raw)


@router.get("/deals", response_model=list[DealPackageItem])
async def list_active_deals(
    session: AsyncSession = Depends(get_db),
    limit: int = Query(10, ge=1, le=50),
    currency_param: str | None = Query(None, alias="currency"),
    current_user: UserModel | None = Depends(get_optional_user),
):
    user_model = current_user if isinstance(current_user, UserModel) else None
    target_curr = _resolve_target_currency(currency_param, user_model, default="EUR")

    raw_items = await deal_package_service.get_active_deals(
        session=session, limit=limit, user_model=user_model
    )
    items = [DealPackageItem(**item) for item in raw_items]
    return [_convert_deal_package_item(item, target_curr) for item in items]


@router.get("/routes-best-deals", response_model=list[DealPackageItem])
async def list_routes_best_deals(
    session: AsyncSession = Depends(get_db),
    limit_per_route: int = Query(3, ge=1, le=10),
    currency_param: str | None = Query(None, alias="currency"),
    current_user: UserModel | None = Depends(get_optional_user),
):
    user_model = current_user if isinstance(current_user, UserModel) else None
    target_curr = _resolve_target_currency(currency_param, user_model, default="EUR")
    alerts = (await session.execute(select(DealWatchAlertModel))).scalars().all()
    all_deals: list[DealPackageItem] = []
    for alert in alerts:
        route_deals = await list_route_deals(
            route_id=alert.id,
            session=session,
            limit=limit_per_route,
            currency_param=target_curr,
            current_user=user_model,
        )
        all_deals.extend(route_deals)
    return all_deals


@router.get("/routes/{route_id}/deals", response_model=list[DealPackageItem])
async def list_route_deals(
    route_id: str,
    session: AsyncSession = Depends(get_db),
    limit: int = Query(5, ge=1, le=20),
    currency_param: str | None = Query(None, alias="currency"),
    current_user: UserModel | None = Depends(get_optional_user),
):
    user_model = current_user if isinstance(current_user, UserModel) else None
    target_curr = _resolve_target_currency(currency_param, user_model, default="EUR")
    raw_items = await deal_package_service.get_route_deals(
        session=session, route_id=route_id, limit=limit, user_model=user_model
    )
    items = [DealPackageItem(**item) for item in raw_items]
    return [_convert_deal_package_item(item, target_curr) for item in items]


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
            consecutive_failure_days=r.consecutive_failure_days or 0,
            last_coverage=r.last_coverage,
            last_run_id=r.last_run_id,
            last_error=r.last_error,
            updated_at=r.updated_at.isoformat(),
        )
        for r in rows
    ]


@router.get("/telemetry/daily-report", response_model=DailyReportResponse)
async def get_daily_market_report(
    session: AsyncSession = Depends(get_db),
):
    """
    Daily Report API (PLAN.md P7.1):
    Calls made against the limit, success rate per provider, coverage per route and month,
    freshness histogram of found_at, count of stale rows, and drift on verified deals.
    """
    from datetime import datetime, timezone
    import numpy as np
    from app.db.models import (
        MarketPriceTickModel,
        MarketSweepRunModel,
        ProviderHealthModel,
        RouteMonthCoverageModel,
    )
    from app.engine.market.config import config

    now = datetime.now(timezone.utc)
    today_start = now.replace(hour=0, minute=0, second=0, microsecond=0)

    # 1. Calls made against limit
    runs_stmt = select(
        func.coalesce(func.sum(MarketSweepRunModel.calls_made), 0)
    ).where(MarketSweepRunModel.started_at >= today_start)
    calls_res = await session.execute(runs_stmt)
    calls_made = int(calls_res.scalar() or 0)
    limit = config.LIVE_DAILY_BUDGET_TIER2
    fraction = round(calls_made / limit, 3) if limit > 0 else 0.0
    calls_vs_limit = CallsVsLimit(
        calls_made_today=calls_made,
        daily_limit=limit,
        budget_fraction_used=fraction,
    )

    # 2. Provider stats
    health_stmt = select(ProviderHealthModel).order_by(
        ProviderHealthModel.asset_type, ProviderHealthModel.provider
    )
    health_rows = (await session.execute(health_stmt)).scalars().all()
    provider_stats: list[ProviderTelemetryItem] = []
    for h in health_rows:
        total_ops = h.failure_count + (1 if h.last_ok_at else 0)
        success_ops = max(total_ops - h.failure_count, 0)
        rate = round(success_ops / total_ops, 3) if total_ops > 0 else 1.0
        provider_stats.append(
            ProviderTelemetryItem(
                provider=h.provider,
                asset_type=h.asset_type,
                status=h.status,
                success_rate=rate,
                consecutive_failures=h.consecutive_failures,
                consecutive_failure_days=h.consecutive_failure_days or 0,
                last_coverage=h.last_coverage,
            )
        )

    # 3. Route month coverage
    cov_stmt = select(RouteMonthCoverageModel).order_by(
        RouteMonthCoverageModel.origin,
        RouteMonthCoverageModel.dest,
        RouteMonthCoverageModel.month,
    )
    cov_rows = (await session.execute(cov_stmt)).scalars().all()
    route_month_coverage: list[RouteMonthCoverageItem] = [
        RouteMonthCoverageItem(
            route=f"{c.origin}->{c.dest}",
            month=c.month,
            days_with_price=c.days_with_price,
            days_in_month=c.days_in_month,
            coverage_pct=round(c.days_with_price / c.days_in_month * 100.0, 1)
            if c.days_in_month > 0
            else 0.0,
        )
        for c in cov_rows
    ]

    # 4. Freshness histogram and stale rows
    ticks_stmt = select(
        func.coalesce(
            MarketPriceTickModel.source_observed_at, MarketPriceTickModel.observed_at
        )
    )
    tick_rows = (await session.execute(ticks_stmt)).scalars().all()
    hist = {"<1d": 0, "1-3d": 0, "3-7d": 0, ">7d": 0}
    stale_count = 0
    for f_at in tick_rows:
        if not f_at:
            continue
        age_days = (now - f_at).total_seconds() / 86400.0
        if age_days < 1.0:
            hist["<1d"] += 1
        elif age_days < 3.0:
            hist["1-3d"] += 1
        elif age_days <= 7.0:
            hist["3-7d"] += 1
        else:
            hist[">7d"] += 1

        if age_days > config.MARKET_MAX_OBSERVATION_AGE_DAYS:
            stale_count += 1

    # 5. Verified deals drift
    cand_stmt = select(DealCandidateModel.verification_json).where(
        DealCandidateModel.verification_json.isnot(None)
    )
    cand_rows = (await session.execute(cand_stmt)).scalars().all()
    drifts: list[float] = []
    for ver in cand_rows:
        if isinstance(ver, dict) and "drift" in ver:
            try:
                drifts.append(float(ver["drift"]))
            except (ValueError, TypeError):
                pass

    if drifts:
        drift_stats = VerifiedDealsDrift(
            count=len(drifts),
            mean_drift_pct=round(float(np.mean(drifts)) * 100.0, 2),
            median_drift_pct=round(float(np.median(drifts)) * 100.0, 2),
            max_drift_pct=round(float(np.max(drifts)) * 100.0, 2),
        )
    else:
        drift_stats = VerifiedDealsDrift(
            count=0,
            mean_drift_pct=0.0,
            median_drift_pct=0.0,
            max_drift_pct=0.0,
        )

    return DailyReportResponse(
        run_date=now.date().isoformat(),
        calls_vs_limit=calls_vs_limit,
        provider_stats=provider_stats,
        route_month_coverage=route_month_coverage,
        freshness_histogram=hist,
        stale_rows_count=stale_count,
        verified_deals_drift=drift_stats,
    )


@router.post("/holiday-matches", response_model=list[HolidayMatchedPackage])
async def get_holiday_matched_packages(
    body: HolidayMatchesRequest,
    currency_param: str | None = Query(None, alias="currency"),
    session: AsyncSession = Depends(get_db),
    current_user: UserModel | None = Depends(get_optional_user),
):
    """
    Finds monitored route packages that completely fit within the user's marked holiday dates.
    """
    if not body.holiday_dates:
        return []

    target_currency = _resolve_target_currency(
        currency_param or getattr(body, "currency", None), current_user, default="EUR"
    )

    holiday_set = set(body.holiday_dates)
    now = datetime.now(timezone.utc)
    today = now.date()

    # Load active monitored routes
    stmt = select(DealWatchAlertModel).where(DealWatchAlertModel.is_active.is_(True))
    res = await session.execute(stmt)
    active_alerts = res.scalars().all()

    matched_packages: list[HolidayMatchedPackage] = []
    feed = CompositeFlightFeed()

    for alert in active_alerts:
        dest_code = alert.destinations[0] if alert.destinations else None
        if not dest_code:
            continue
        dest_name = await _resolve_city_name(session, dest_code)

        # Baseline resolution for route
        base_stmt = (
            select(RouteBaselineModel)
            .where(
                RouteBaselineModel.origin_iata == alert.origin_iata,
                RouteBaselineModel.destination_code == dest_code,
                RouteBaselineModel.level == "drop_month",
                RouteBaselineModel.depart_month == 0,
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

        ret_base_stmt = (
            select(RouteBaselineModel)
            .where(
                RouteBaselineModel.origin_iata == dest_code,
                RouteBaselineModel.destination_code == alert.origin_iata,
                RouteBaselineModel.level == "drop_month",
                RouteBaselineModel.depart_month == 0,
            )
            .limit(1)
        )
        ret_base_res = await session.execute(ret_base_stmt)
        ret_baseline = ret_base_res.scalar_one_or_none()
        inbound_p10 = (
            round(float(ret_baseline.q10) / 100.0, 2)
            if ret_baseline and ret_baseline.q10 is not None
            else p10
        )
        inbound_p50 = (
            round(float(ret_baseline.q50) / 100.0, 2)
            if ret_baseline and ret_baseline.q50 is not None
            else p50
        )

        # Dynamic Hotel benchmark (zero hardcoded values)
        hotel_rate_eur = 0.0
        if body.pricing == "package":
            lodging_median, _, _ = await resolve_baseline_median(
                session, "lodging", "", dest_code, today, today, "EUR"
            )
            if lodging_median:
                hotel_rate_eur = round(lodging_median / 100.0, 2)
            else:
                obs_m_stmt = select(
                    func.min(HotelRateObservationModel.price_nightly_cents)
                ).where(
                    HotelRateObservationModel.destination_code == dest_code,
                    HotelRateObservationModel.check_in >= today,
                )
                m_cents = (await session.execute(obs_m_stmt)).scalar_one_or_none()
                hotel_rate_eur = round(m_cents / 100.0, 2) if m_cents else 0.0

        outbound_quotes = await _fetch_corridor_quotes(
            origin=alert.origin_iata,
            dest=dest_code,
            date_from=today,
            date_to=today + timedelta(days=365),
            feed=feed,
            session=session,
        )
        inbound_quotes = await _fetch_corridor_quotes(
            origin=dest_code,
            dest=alert.origin_iata,
            date_from=today,
            date_to=today + timedelta(days=365),
            feed=feed,
            session=session,
        )

        # Find packages where [depart_date, return_date] is a complete subset of holiday_set
        for dep_str, out_q in outbound_quotes.items():
            if dep_str not in holiday_set:
                continue
            dep_d = date.fromisoformat(dep_str)

            for n in range(alert.min_nights, alert.max_nights + 1):
                ret_d = dep_d + timedelta(days=n)
                ret_str = ret_d.isoformat()
                if ret_str not in inbound_quotes:
                    continue

                # Verify EVERY intermediate date is also in holiday_set
                fits_all_days = True
                curr_check = dep_d
                while curr_check <= ret_d:
                    if curr_check.isoformat() not in holiday_set:
                        fits_all_days = False
                        break
                    curr_check += timedelta(days=1)

                if not fits_all_days:
                    continue

                # Matches completely!
                in_q = inbound_quotes[ret_str]
                flight_total = out_q["price_eur"] + in_q["price_eur"]
                total_price = flight_total + (
                    hotel_rate_eur * n if body.pricing == "package" else 0.0
                )
                total_price = round(total_price, 2)

                day_p10 = (
                    (p10 or 0)
                    + (inbound_p10 or p10 or 0)
                    + (hotel_rate_eur * n if body.pricing == "package" else 0)
                ) or None
                day_p50 = (
                    (p50 or 0)
                    + (inbound_p50 or p50 or 0)
                    + (hotel_rate_eur * n if body.pricing == "package" else 0)
                ) or None

                if day_p10 and total_price <= day_p10:
                    tier = "deal"
                elif day_p50 and total_price <= day_p50:
                    tier = "fair"
                else:
                    tier = "standard"

                matched_packages.append(
                    HolidayMatchedPackage(
                        route_id=alert.id,
                        origin_iata=alert.origin_iata,
                        destination_code=dest_code,
                        destination_name=dest_name,
                        depart_date=dep_str,
                        return_date=ret_str,
                        nights=n,
                        total_price_eur=total_price,
                        price_tier=tier,
                        pricing=body.pricing,
                        outbound_flight=FlightSummary(
                            carrier=out_q["carrier"],
                            flight_number=out_q["flight_number"],
                            duration_mins=out_q["duration_mins"],
                            departure_time=out_q["departure_time"],
                            booking_url=out_q["booking_url"],
                            price_eur=out_q["price_eur"],
                        ),
                        return_flight=FlightSummary(
                            carrier=in_q["carrier"],
                            flight_number=in_q["flight_number"],
                            duration_mins=in_q["duration_mins"],
                            departure_time=in_q["departure_time"],
                            booking_url=in_q["booking_url"],
                            price_eur=in_q["price_eur"],
                        ),
                        lodging=LodgingSummary(
                            nights=n,
                            price_per_night_eur=hotel_rate_eur,
                            total_lodging_eur=round(hotel_rate_eur * n, 2),
                        )
                        if body.pricing == "package"
                        else None,
                    )
                )

    # Sort matched packages by total price ascending
    matched_packages.sort(key=lambda p: p.total_price_eur)
    if target_currency != "EUR":
        matched_packages = [
            _convert_holiday_matched_package(pkg, target_currency)
            for pkg in matched_packages
        ]
    return matched_packages
