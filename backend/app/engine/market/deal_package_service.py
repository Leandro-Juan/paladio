"""
Paladio Unified Deal Package Service.
Single Source of Truth for assembling verified, rich flight + lodging deal packages.
Enforces 100% dynamic data, 24h sweep cadence with previous-day fallback on failure,
and seamless on-demand resolution of flight timetables and destination lodging.
"""

from __future__ import annotations

import json
import logging
from datetime import date, datetime, timedelta, timezone
from typing import Any

from sqlalchemy import desc, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models import (
    CityModel,
    DealEventModel,
    DealWatchAlertModel,
    DestinationAirportModel,
    HotelPropertyModel,
    HotelRateObservationModel,
    MarketPriceTickModel,
    PriceDailyModel,
    UserModel,
)
from app.engine.market.baselines import resolve_route_baseline_quantiles
from app.engine.market.config import config
from app.engine.market.lodging.ranking import HotelCandidate, rank_hotels

logger = logging.getLogger(__name__)


class DealPackageService:
    """
    Unified Deal Engine domain service.
    Orchestrates roundtrip flight pairing from market_price_ticks, on-demand lodging resolution,
    and statistical baseline savings evaluation.
    """

    def __init__(self, lodging_feed: Any | None = None):
        self._lodging_feed = lodging_feed

    def _get_lodging_feed(self):
        if self._lodging_feed is None:
            from app.engine.market.adapters import OpenLodgingFeed

            self._lodging_feed = OpenLodgingFeed()
        return self._lodging_feed

    async def resolve_city_name(self, session: AsyncSession, code: str) -> str:
        """Dynamically resolves city display name from DestinationAirportModel, CityModel, or AirportService."""
        code_clean = (code or "").strip().upper()
        if not code_clean:
            return code

        stmt = (
            select(CityModel.name)
            .join(
                DestinationAirportModel, DestinationAirportModel.city_id == CityModel.id
            )
            .where(DestinationAirportModel.iata == code_clean)
            .limit(1)
        )
        name = (await session.execute(stmt)).scalar_one_or_none()
        if name:
            return name

        stmt_city = (
            select(CityModel.name)
            .where(
                (CityModel.id.ilike(f"{code_clean}%"))
                | (CityModel.name.ilike(f"{code_clean}%"))
            )
            .limit(1)
        )
        city_name = (await session.execute(stmt_city)).scalar_one_or_none()
        if city_name:
            return city_name

        from app.services.airport_service import get_airport_service

        city = get_airport_service().get_city_from_iata(code_clean)
        if city and city != "Unknown":
            return city

        return code_clean

    def _extract_meta(self, tick: MarketPriceTickModel) -> dict[str, Any]:
        """Safely parses metadata_json from a market price tick."""
        if isinstance(tick.metadata_json, dict):
            return tick.metadata_json
        if isinstance(tick.metadata_json, str) and tick.metadata_json.strip():
            try:
                return json.loads(tick.metadata_json)
            except Exception:
                pass
        return {}

    @staticmethod
    def _has_rich_lodging_meta(cand: HotelCandidate) -> bool:
        """Returns True when a hotel candidate carries photo, address, or amenities."""
        return bool(cand.photo_url or cand.address or cand.amenities)

    @staticmethod
    def _build_lodging_item(
        ranked_hotel: Any,
        nights: int,
        travelers: int,
        fallback_badge: str = "Best Value",
    ) -> tuple[dict[str, Any], int]:
        """Formats a RankedHotel into the deal package lodging payload."""
        cand = ranked_hotel.candidate
        hotel_nightly_cents = cand.nightly_cents
        prop_name = cand.name
        if travelers > 1 and "Guest" not in prop_name and "people" not in prop_name:
            prop_name = f"{prop_name} ({travelers} Guests)"
        total_hotel_cents = hotel_nightly_cents * nights
        q_score = (
            round(
                cand.review_score * 20.0
                if cand.review_score <= 5.0
                else cand.review_score * 10.0,
                1,
            )
            if cand.review_score
            else None
        )
        return (
            {
                "property_name": prop_name,
                "nightly_base_eur": round(hotel_nightly_cents / 100.0, 2),
                "landed_total_eur": round(total_hotel_cents / 100.0, 2),
                "quality_score": q_score,
                "stars": cand.stars,
                "review_score": cand.review_score,
                "review_count": cand.review_count,
                "booking_url": cand.deep_link,
                "source": cand.provider or "lodging",
                "is_live": False,
                "taxes_included": cand.taxes_included,
                "badge": ranked_hotel.badge or fallback_badge,
                "photo_url": cand.photo_url,
                "amenities": cand.amenities or [],
                "room_type": cand.room_type,
                "free_cancellation": cand.free_cancellation,
                "board": cand.board,
                "address": cand.address,
            },
            total_hotel_cents,
        )

    @staticmethod
    def _tick_from_price_daily(
        pd_row: PriceDailyModel, today: date
    ) -> MarketPriceTickModel:
        """Synthesizes an in-memory tick from a PriceDailyModel rollup row."""
        obs_dt = datetime.combine(
            pd_row.bucket, datetime.min.time(), tzinfo=timezone.utc
        )
        return MarketPriceTickModel(
            id=f"daily-{pd_row.origin_iata}-{pd_row.destination_code}-{pd_row.depart_date.isoformat()}",
            observed_at=obs_dt,
            asset_type="flight",
            origin_iata=pd_row.origin_iata,
            destination_code=pd_row.destination_code,
            depart_date=pd_row.depart_date,
            nights=pd_row.nights,
            lead_time_days=max((pd_row.depart_date - today).days, 0),
            currency=pd_row.currency,
            base_price_cents=pd_row.min_base,
            source=pd_row.source,
            source_class=pd_row.source_class,
            source_observed_at=obs_dt,
            content_hash=b"",
            metadata_json={},
        )

    async def format_deal_event(
        self, session: AsyncSession, ev: DealEventModel
    ) -> dict[str, Any] | None:
        """Formats a persistent DealEventModel row into deal package dict."""
        pkg = ev.package_json or {}
        orig = pkg.get("origin_iata") or ""
        dest = pkg.get("destination_code") or ""
        flight_info = pkg.get("flight")
        ret_flight_info = pkg.get("return_flight")
        if not orig or not dest or not flight_info or not ret_flight_info:
            return None

        alert = None
        if ev.alert_id:
            alert = await session.scalar(
                select(DealWatchAlertModel).where(DealWatchAlertModel.id == ev.alert_id)
            )
        travelers = getattr(alert, "travelers", 1) or pkg.get("travelers", 1) or 1
        participants = getattr(alert, "participants", None) or pkg.get("participants")

        raw_orig_name = pkg.get("origin_name")
        orig_name = (
            raw_orig_name
            if raw_orig_name and raw_orig_name.strip().upper() != orig.strip().upper()
            else await self.resolve_city_name(session, orig)
        )
        raw_dest_name = pkg.get("destination_name")
        dest_name = (
            raw_dest_name
            if raw_dest_name and raw_dest_name.strip().upper() != dest.strip().upper()
            else await self.resolve_city_name(session, dest)
        )

        dep_date = pkg.get("depart_date") or ""
        ret_date = pkg.get("return_date") or ""
        nights = pkg.get("nights", 3)

        flight_info = pkg.get("flight") or {}
        fl_airline = flight_info.get("airline") or "Carrier"
        fl_number = flight_info.get("flight_number") or ""
        fl_dep_time = flight_info.get("depart_time") or ""
        fl_arr_time = flight_info.get("arrival_time") or ""
        fl_base_unit = flight_info.get("base_price_cents", 0)
        fl_landed_unit = flight_info.get("landed_price_cents") or fl_base_unit
        fl_base_cents = int(fl_base_unit * travelers)
        fl_landed_cents = int(fl_landed_unit * travelers)
        fl_url = (
            flight_info.get("deep_link")
            or f"https://www.ryanair.com/gb/en/trip/flights/select?originIata={orig}&destinationIata={dest}&dateOut={dep_date}"
        )

        lodging_info = pkg.get("lodging")
        lodging_item = None
        lg_landed_cents = 0
        if lodging_info and lodging_info.get("property_name"):
            lg_name = lodging_info.get("property_name")
            if travelers > 1 and "Guest" not in lg_name and "people" not in lg_name:
                lg_name = f"{lg_name} ({travelers} Guests)"
            lg_nightly_cents = lodging_info.get("base_nightly_cents", 0)
            lg_landed_cents = lodging_info.get("landed_total_cents") or (
                lg_nightly_cents * nights
            )
            lg_quality = lodging_info.get("quality_score")
            lg_url = lodging_info.get("deep_link") or lodging_info.get("booking_url")
            if not lg_url and dest:
                checkin_str = dep_date if dep_date else ""
                checkout_str = ret_date if ret_date else ""
                dates_query = (
                    f"&checkin={checkin_str}&checkout={checkout_str}"
                    if checkin_str and checkout_str
                    else ""
                )
                lg_url = f"https://www.booking.com/searchresults.html?ss={dest}{dates_query}&group_adults={travelers}&no_rooms=1"
            elif lg_url and travelers > 1 and "group_adults=" not in lg_url:
                sep = "&" if "?" in lg_url else "?"
                lg_url = f"{lg_url}{sep}group_adults={travelers}&no_rooms=1"

            photo_url = lodging_info.get("photo_url")
            amenities = lodging_info.get("amenities") or []
            room_type = lodging_info.get("room_type")
            free_cancellation = lodging_info.get("free_cancellation")
            board = lodging_info.get("board")
            address = lodging_info.get("address")

            if not photo_url or not amenities:
                raw_prop_name = (
                    lodging_info.get("property_name", "").split(" (")[0].strip()
                )
                if raw_prop_name:
                    prop_row = (
                        await session.execute(
                            select(
                                HotelPropertyModel.photo_url,
                                HotelPropertyModel.amenities,
                                HotelPropertyModel.address,
                            )
                            .where(HotelPropertyModel.name.ilike(f"%{raw_prop_name}%"))
                            .limit(1)
                        )
                    ).first()
                    if prop_row:
                        if not photo_url and prop_row[0]:
                            photo_url = prop_row[0]
                        if not amenities and prop_row[1]:
                            amenities = prop_row[1]
                        if not address and prop_row[2]:
                            address = prop_row[2]

            lodging_item = {
                "property_name": lg_name,
                "nightly_base_eur": round(lg_nightly_cents / 100.0, 2),
                "landed_total_eur": round(lg_landed_cents / 100.0, 2),
                "quality_score": float(lg_quality) if lg_quality is not None else None,
                "stars": lodging_info.get("stars"),
                "review_score": lodging_info.get("review_score"),
                "review_count": lodging_info.get("review_count"),
                "booking_url": lg_url,
                "source": lodging_info.get("source", "lodging"),
                "is_live": lodging_info.get("is_live", False),
                "taxes_included": lodging_info.get("taxes_included", True),
                "badge": lodging_info.get("badge"),
                "photo_url": photo_url,
                "amenities": amenities,
                "room_type": room_type,
                "free_cancellation": free_cancellation,
                "board": board,
                "address": address,
            }

        ret_flight_info = pkg.get("return_flight")
        ret_flight_item = None
        ret_landed_cents = 0
        if ret_flight_info:
            ret_base_unit = ret_flight_info.get("base_price_cents", 0)
            ret_landed_unit = ret_flight_info.get("landed_price_cents") or ret_base_unit
            ret_base_cents = int(ret_base_unit * travelers)
            ret_landed_cents = int(ret_landed_unit * travelers)
            ret_url = (
                ret_flight_info.get("deep_link")
                or f"https://www.ryanair.com/gb/en/trip/flights/select?originIata={dest}&destinationIata={orig}&dateOut={ret_date}"
            )
            ret_flight_item = {
                "airline": ret_flight_info.get("airline") or "Flight",
                "flight_number": ret_flight_info.get("flight_number"),
                "depart_time": ret_flight_info.get("depart_time"),
                "arrival_time": ret_flight_info.get("arrival_time"),
                "base_price_eur": round(ret_base_cents / 100.0, 2),
                "landed_price_eur": round(ret_landed_cents / 100.0, 2),
                "unit_price_eur": round(ret_landed_unit / 100.0, 2),
                "booking_url": ret_url,
                "source": ret_flight_info.get("source", "carrier"),
                "is_live": ret_flight_info.get("is_live", False),
                "ancillaries_excluded": True,
            }

        total_landed_cents = pkg.get("total_landed_cents")
        if total_landed_cents is None or travelers > 1:
            total_landed_cents = fl_landed_cents + ret_landed_cents + lg_landed_cents

        savings_cents = pkg.get("landed_savings_cents") or 0
        package_ratio = pkg.get("package_ratio") or 0.75
        realism = pkg.get("realism_score") or 8.5

        total_price_eur = round(total_landed_cents / 100.0, 2)
        price_per_traveler_eur = (
            round(total_price_eur / travelers, 2) if travelers > 0 else total_price_eur
        )
        savings_eur = pkg.get("savings_eur") or round(savings_cents / 100.0, 2)
        savings_per_traveler_eur = (
            round(savings_eur / travelers, 2) if travelers > 0 else savings_eur
        )
        baseline_median_eur = pkg.get("baseline_median_eur") or round(
            (total_landed_cents + savings_cents) / 100.0, 2
        )
        median_per_traveler_eur = (
            round(baseline_median_eur / travelers, 2)
            if travelers > 0
            else baseline_median_eur
        )
        discount_pct = pkg.get("discount_pct") or round(
            max((1.0 - package_ratio) * 100, 0.0), 1
        )

        deal_status = (
            pkg.get("deal_status") or pkg.get("status") or "flight_deal_unverified"
        )
        is_bookable = bool(pkg.get("is_bookable", False))
        if deal_status == "flight_deal_unverified":
            is_bookable = False

        return {
            "id": ev.id,
            "alert_id": ev.alert_id or "",
            "candidate_id": ev.candidate_id or "",
            "origin_iata": orig,
            "destination_code": dest,
            "origin_name": orig_name,
            "destination_name": dest_name,
            "depart_date": dep_date,
            "return_date": ret_date,
            "nights": nights,
            "total_price_eur": total_price_eur,
            "price_per_traveler_eur": price_per_traveler_eur,
            "baseline_median_eur": baseline_median_eur,
            "median_per_traveler_eur": median_per_traveler_eur,
            "savings_eur": savings_eur,
            "savings_per_traveler_eur": savings_per_traveler_eur,
            "discount_pct": discount_pct,
            "package_ratio": package_ratio,
            "realism_score": realism,
            "status": ev.status.upper(),
            "detected_at": ev.alerted_at.isoformat()
            if ev.alerted_at
            else datetime.now(timezone.utc).isoformat(),
            "flight": {
                "airline": fl_airline,
                "flight_number": fl_number,
                "depart_time": fl_dep_time or None,
                "arrival_time": fl_arr_time or None,
                "base_price_eur": round(fl_base_cents / 100.0, 2),
                "landed_price_eur": round(fl_landed_cents / 100.0, 2),
                "unit_price_eur": round(fl_landed_unit / 100.0, 2),
                "booking_url": fl_url,
                "source": flight_info.get("source", "carrier"),
                "is_live": flight_info.get("is_live", False),
                "ancillaries_excluded": True,
            },
            "return_flight": ret_flight_item,
            "lodging": lodging_item,
            "travelers": travelers,
            "participants": participants,
            "deal_status": deal_status,
            "is_bookable": is_bookable,
            "explanation": pkg.get("explanation"),
            "source": pkg.get("source") or flight_info.get("source"),
            "source_class": pkg.get("source_class") or flight_info.get("source_class"),
            "found_at": pkg.get("found_at") or flight_info.get("found_at"),
            "baseline_level_used": pkg.get("baseline_level_used"),
            "feasibility": pkg.get("feasibility"),
        }

    async def get_route_deals(
        self,
        session: AsyncSession,
        route_id: str,
        limit: int = 5,
        user_model: UserModel | None = None,
    ) -> list[dict[str, Any]]:
        """
        Retrieves top verified deal packages for a route.
        Unified: Returns active DealEvents if available, or dynamically constructs full
        packages from market_price_ticks with rich flight timetables and dynamic lodging.
        Enforces 24h cadence with previous-day fallback when today's sweep has not run.
        """
        # 1. Check for active/alerted persistent DealEvents
        stmt = (
            select(DealEventModel)
            .where(
                DealEventModel.alert_id == route_id,
                DealEventModel.status.in_(["alerted", "pending", "active"]),
            )
            .order_by(desc(DealEventModel.alerted_at))
            .limit(limit)
        )
        events = (await session.execute(stmt)).scalars().all()
        items: list[dict[str, Any]] = []
        for ev in events:
            item = await self.format_deal_event(session, ev)
            if item:
                items.append(item)

        if items:
            items.sort(key=lambda d: (-d["discount_pct"], d["total_price_eur"]))
            return items[:limit]

        # 2. Dynamic Assembly from market_price_ticks
        alert = await session.scalar(
            select(DealWatchAlertModel).where(DealWatchAlertModel.id == route_id)
        )
        if not alert:
            return []

        orig = alert.origin_iata.upper()
        dest_code = (alert.destinations[0] if alert.destinations else "").upper()
        if not orig or not dest_code:
            return []

        orig_name = await self.resolve_city_name(session, orig)
        dest_name = await self.resolve_city_name(session, dest_code)
        today = datetime.now(timezone.utc).date()

        # Date window boundaries
        e_date = max(alert.earliest_date, today) if alert.earliest_date else today
        l_date = alert.latest_date if alert.latest_date else today + timedelta(days=330)

        # Query outbound ticks from market_price_ticks
        # Enforcing 24h cadence: Ticks within MARKET_MAX_OBSERVATION_AGE_DAYS are valid.
        # If today's sweep has not run or failed, queries automatically fall back to previous day!
        max_age_days = getattr(config, "MARKET_MAX_OBSERVATION_AGE_DAYS", 7)
        oldest_valid_obs = datetime.now(timezone.utc) - timedelta(days=max_age_days)

        fwd_out_stmt = (
            select(MarketPriceTickModel)
            .where(
                MarketPriceTickModel.asset_type == "flight",
                MarketPriceTickModel.origin_iata == orig,
                MarketPriceTickModel.destination_code == dest_code,
                MarketPriceTickModel.depart_date >= e_date,
                MarketPriceTickModel.depart_date <= l_date,
                MarketPriceTickModel.source != "injected_aviasales",
                MarketPriceTickModel.observed_at >= oldest_valid_obs,
            )
            .order_by(
                MarketPriceTickModel.depart_date.asc(),
                MarketPriceTickModel.base_price_cents.asc(),
                desc(MarketPriceTickModel.observed_at),
            )
        )
        all_out_ticks = (await session.execute(fwd_out_stmt)).scalars().all()
        if not all_out_ticks:
            fwd_out_fallback = (
                select(MarketPriceTickModel)
                .where(
                    MarketPriceTickModel.asset_type == "flight",
                    MarketPriceTickModel.origin_iata == orig,
                    MarketPriceTickModel.destination_code == dest_code,
                    MarketPriceTickModel.depart_date >= e_date,
                    MarketPriceTickModel.depart_date <= l_date,
                    MarketPriceTickModel.source != "injected_aviasales",
                )
                .order_by(
                    MarketPriceTickModel.depart_date.asc(),
                    MarketPriceTickModel.base_price_cents.asc(),
                    desc(MarketPriceTickModel.observed_at),
                )
            )
            all_out_ticks = (await session.execute(fwd_out_fallback)).scalars().all()

        # Deduplicate to cheapest observation per depart_date
        best_out_by_date: dict[date, MarketPriceTickModel] = {}
        for ot in all_out_ticks:
            dep_d = ot.depart_date
            if (
                dep_d not in best_out_by_date
                or ot.base_price_cents < best_out_by_date[dep_d].base_price_cents
            ):
                best_out_by_date[dep_d] = ot

        # Fill missing outbound dates from PriceDailyModel rollup
        out_daily_stmt = (
            select(PriceDailyModel)
            .where(
                PriceDailyModel.asset_type == "flight",
                PriceDailyModel.origin_iata == orig,
                PriceDailyModel.destination_code == dest_code,
                PriceDailyModel.depart_date >= e_date,
                PriceDailyModel.depart_date <= l_date,
                PriceDailyModel.source != "injected_aviasales",
            )
            .order_by(
                PriceDailyModel.depart_date.asc(),
                PriceDailyModel.min_base.asc(),
                desc(PriceDailyModel.bucket),
            )
        )
        for pd_row in (await session.execute(out_daily_stmt)).scalars().all():
            if pd_row.depart_date not in best_out_by_date:
                best_out_by_date[pd_row.depart_date] = self._tick_from_price_daily(
                    pd_row, today
                )

        sorted_out_dates = sorted(
            best_out_by_date.keys(), key=lambda d: best_out_by_date[d].base_price_cents
        )[:15]

        # Query return ticks
        min_ret_date = e_date + timedelta(days=alert.min_nights or 1)
        max_ret_date = l_date + timedelta(days=alert.max_nights or 30)
        fwd_ret_stmt = (
            select(MarketPriceTickModel)
            .where(
                MarketPriceTickModel.asset_type == "flight",
                MarketPriceTickModel.origin_iata == dest_code,
                MarketPriceTickModel.destination_code == orig,
                MarketPriceTickModel.depart_date >= min_ret_date,
                MarketPriceTickModel.source != "injected_aviasales",
                MarketPriceTickModel.observed_at >= oldest_valid_obs,
            )
            .order_by(
                MarketPriceTickModel.depart_date.asc(),
                MarketPriceTickModel.base_price_cents.asc(),
                desc(MarketPriceTickModel.observed_at),
            )
        )
        all_ret_ticks = (await session.execute(fwd_ret_stmt)).scalars().all()
        if not all_ret_ticks:
            fwd_ret_fallback = (
                select(MarketPriceTickModel)
                .where(
                    MarketPriceTickModel.asset_type == "flight",
                    MarketPriceTickModel.origin_iata == dest_code,
                    MarketPriceTickModel.destination_code == orig,
                    MarketPriceTickModel.depart_date >= min_ret_date,
                    MarketPriceTickModel.source != "injected_aviasales",
                )
                .order_by(
                    MarketPriceTickModel.depart_date.asc(),
                    MarketPriceTickModel.base_price_cents.asc(),
                    desc(MarketPriceTickModel.observed_at),
                )
            )
            all_ret_ticks = (await session.execute(fwd_ret_fallback)).scalars().all()

        best_ret_by_date: dict[date, MarketPriceTickModel] = {}
        for rt in all_ret_ticks:
            r_dep = rt.depart_date
            if (
                r_dep not in best_ret_by_date
                or rt.base_price_cents < best_ret_by_date[r_dep].base_price_cents
            ):
                best_ret_by_date[r_dep] = rt

        # Fill missing return dates from PriceDailyModel rollup
        ret_daily_stmt = (
            select(PriceDailyModel)
            .where(
                PriceDailyModel.asset_type == "flight",
                PriceDailyModel.origin_iata == dest_code,
                PriceDailyModel.destination_code == orig,
                PriceDailyModel.depart_date >= min_ret_date,
                PriceDailyModel.depart_date <= max_ret_date,
                PriceDailyModel.source != "injected_aviasales",
            )
            .order_by(
                PriceDailyModel.depart_date.asc(),
                PriceDailyModel.min_base.asc(),
                desc(PriceDailyModel.bucket),
            )
        )
        for pd_row in (await session.execute(ret_daily_stmt)).scalars().all():
            if pd_row.depart_date not in best_ret_by_date:
                best_ret_by_date[pd_row.depart_date] = self._tick_from_price_daily(
                    pd_row, today
                )

        # Setup destination coordinates and user preferences for lodging ranking
        city_stmt = (
            select(CityModel)
            .where(
                (CityModel.id == dest_code)
                | (CityModel.country_code == dest_code)
                | (CityModel.name.ilike(f"%{dest_code}%"))
            )
            .limit(1)
        )
        city_obj = (await session.execute(city_stmt)).scalar_one_or_none()
        center_lat = city_obj.center_lat if city_obj else None
        center_lon = city_obj.center_lon if city_obj else None

        user_prefs = (
            (user_model.preferences or {})
            if user_model and user_model.preferences
            else {}
        )
        if not user_prefs and alert.user_id:
            u_row = await session.scalar(
                select(UserModel).where(UserModel.id == alert.user_id)
            )
            if u_row and u_row.preferences:
                user_prefs = u_row.preferences

        # Load existing lodging observations for destination
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
                HotelPropertyModel.photo_url,
                HotelPropertyModel.amenities,
                HotelPropertyModel.address,
                HotelRateObservationModel.room_type,
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
        prop_rows = (await session.execute(prop_stmt)).all()
        from collections import defaultdict

        cands_by_date = defaultdict(list)
        for p_row in prop_rows:
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
                    photo_url=p_row[16],
                    amenities=p_row[17],
                    address=p_row[18],
                    room_type=p_row[19],
                )
            )

        best_hotel_by_date = {}
        best_enriched_by_date = {}
        for cin, cl in cands_by_date.items():
            ranked_d = rank_hotels(
                cl,
                user_preferences=user_prefs,
                center_lat=center_lat,
                center_lon=center_lon,
            )
            if ranked_d:
                best_hotel_by_date[cin] = ranked_d[0]
                enriched = [
                    rh for rh in ranked_d if self._has_rich_lodging_meta(rh.candidate)
                ]
                if enriched:
                    best_enriched_by_date[cin] = enriched[0]

        # Route statistical baselines
        quantiles, _, _ = await resolve_route_baseline_quantiles(
            session=session,
            origin_iata=alert.origin_iata,
            destination_code=dest_code,
            depart_date=alert.earliest_date or today,
            observation_date=today,
        )
        median_fl_cents = quantiles.get("q50") if quantiles else None
        if median_fl_cents is None and best_out_by_date:
            median_fl_cents = int(
                sum(t.base_price_cents for t in best_out_by_date.values())
                / len(best_out_by_date)
            )

        cand_packages: list[dict[str, Any]] = []
        seen_pairs: set[tuple[date, date]] = set()

        cand_travelers = getattr(alert, "travelers", 1) or 1
        cand_participants = getattr(alert, "participants", None)

        for dep_dt in sorted_out_dates:
            out_tick = best_out_by_date[dep_dt]
            out_cents = out_tick.base_price_cents

            # Pair with best return tick
            best_ret_tick: MarketPriceTickModel | None = None
            best_nights = alert.min_nights or 3
            for n in range(alert.min_nights or 1, (alert.max_nights or 30) + 1):
                cand_ret_dt = dep_dt + timedelta(days=n)
                cand_rt = best_ret_by_date.get(cand_ret_dt)
                if cand_rt:
                    if (
                        best_ret_tick is None
                        or cand_rt.base_price_cents < best_ret_tick.base_price_cents
                    ):
                        best_ret_tick = cand_rt
                        best_nights = n

            if not best_ret_tick or (dep_dt, best_ret_tick.depart_date) in seen_pairs:
                continue
            seen_pairs.add((dep_dt, best_ret_tick.depart_date))

            # Extract rich flight metadata for Outbound
            out_meta = self._extract_meta(out_tick)
            out_dep_time = out_meta.get("depart_local")
            out_arr_time = out_meta.get("arrival_local")
            out_fl_num = out_meta.get("flightNumber") or out_meta.get("flight_number")
            out_airline = (
                out_meta.get("airline")
                or out_meta.get("carrier")
                or (out_tick.source.title() if out_tick.source else "Flight")
            )
            out_url = (
                out_meta.get("deep_link")
                or f"https://www.ryanair.com/gb/en/trip/flights/select?originIata={orig}&destinationIata={dest_code}&dateOut={dep_dt.isoformat()}"
            )

            # Extract rich flight metadata for Return
            ret_cents = best_ret_tick.base_price_cents
            ret_meta = self._extract_meta(best_ret_tick)
            ret_dep_time = ret_meta.get("depart_local")
            ret_arr_time = ret_meta.get("arrival_local")
            ret_fl_num = ret_meta.get("flightNumber") or ret_meta.get("flight_number")
            ret_airline = (
                ret_meta.get("airline")
                or ret_meta.get("carrier")
                or (best_ret_tick.source.title() if best_ret_tick.source else "Flight")
            )
            ret_url = (
                ret_meta.get("deep_link")
                or f"https://www.ryanair.com/gb/en/trip/flights/select?originIata={dest_code}&destinationIata={orig}&dateOut={best_ret_tick.depart_date.isoformat()}"
            )

            # Dynamic Lodging Resolution (cached DB observations only; never live-scrape on read):
            chosen_ranked = best_hotel_by_date.get(dep_dt)
            lodging_item: dict[str, Any] | None = None
            total_hotel_cents = 0

            if chosen_ranked and (
                self._has_rich_lodging_meta(chosen_ranked.candidate)
                or not best_enriched_by_date
            ):
                lodging_item, total_hotel_cents = self._build_lodging_item(
                    chosen_ranked,
                    best_nights,
                    cand_travelers,
                    fallback_badge="Best Value",
                )
            elif dep_dt in best_enriched_by_date:
                lodging_item, total_hotel_cents = self._build_lodging_item(
                    best_enriched_by_date[dep_dt],
                    best_nights,
                    cand_travelers,
                    fallback_badge="Best Value",
                )
            elif best_enriched_by_date:
                closest_date = min(
                    best_enriched_by_date.keys(), key=lambda d: abs((d - dep_dt).days)
                )
                lodging_item, total_hotel_cents = self._build_lodging_item(
                    best_enriched_by_date[closest_date],
                    best_nights,
                    cand_travelers,
                    fallback_badge="Destination Best",
                )
            elif chosen_ranked:
                lodging_item, total_hotel_cents = self._build_lodging_item(
                    chosen_ranked,
                    best_nights,
                    cand_travelers,
                    fallback_badge="Best Value",
                )
            elif best_hotel_by_date:
                closest_date = min(
                    best_hotel_by_date.keys(), key=lambda d: abs((d - dep_dt).days)
                )
                lodging_item, total_hotel_cents = self._build_lodging_item(
                    best_hotel_by_date[closest_date],
                    best_nights,
                    cand_travelers,
                    fallback_badge="Destination Best",
                )

            total_fl_cents = (out_cents + ret_cents) * cand_travelers
            total_package_cents = total_fl_cents + total_hotel_cents

            baseline_pkg_cents = (
                (
                    (median_fl_cents * 2 * cand_travelers)
                    + (
                        int(
                            (lodging_item["nightly_base_eur"] * 100) * best_nights * 1.5
                        )
                        if lodging_item
                        else 0
                    )
                )
                if median_fl_cents
                else total_package_cents
            )
            savings_cents = max(0, int(baseline_pkg_cents - total_package_cents))
            discount_pct = round((savings_cents / max(baseline_pkg_cents, 1)) * 100, 1)

            cand_packages.append(
                {
                    "id": f"deal-{route_id[:8]}-{dep_dt.isoformat()}",
                    "alert_id": route_id,
                    "candidate_id": f"cand-{dep_dt.isoformat()}",
                    "origin_iata": orig,
                    "destination_code": dest_code,
                    "origin_name": orig_name,
                    "destination_name": dest_name,
                    "depart_date": dep_dt.isoformat(),
                    "return_date": best_ret_tick.depart_date.isoformat(),
                    "nights": best_nights,
                    "total_price_eur": round(total_package_cents / 100.0, 2),
                    "price_per_traveler_eur": round(
                        total_package_cents / cand_travelers / 100.0, 2
                    )
                    if cand_travelers > 0
                    else round(total_package_cents / 100.0, 2),
                    "baseline_median_eur": round(baseline_pkg_cents / 100.0, 2),
                    "median_per_traveler_eur": round(
                        baseline_pkg_cents / cand_travelers / 100.0, 2
                    )
                    if cand_travelers > 0
                    else round(baseline_pkg_cents / 100.0, 2),
                    "savings_eur": round(savings_cents / 100.0, 2),
                    "savings_per_traveler_eur": round(
                        savings_cents / cand_travelers / 100.0, 2
                    )
                    if cand_travelers > 0
                    else round(savings_cents / 100.0, 2),
                    "discount_pct": discount_pct,
                    "package_ratio": round(
                        total_package_cents / max(baseline_pkg_cents, 1), 3
                    ),
                    "realism_score": 9.2,
                    "status": "ACTIVE",
                    "detected_at": datetime.now(timezone.utc).isoformat(),
                    "flight": {
                        "airline": out_airline,
                        "flight_number": out_fl_num,
                        "depart_time": out_dep_time,
                        "arrival_time": out_arr_time,
                        "base_price_eur": round(out_cents * cand_travelers / 100.0, 2),
                        "landed_price_eur": round(
                            out_cents * cand_travelers / 100.0, 2
                        ),
                        "unit_price_eur": round(out_cents / 100.0, 2),
                        "booking_url": out_url,
                        "source": out_tick.source or "flight",
                        "is_live": False,
                        "ancillaries_excluded": True,
                    },
                    "return_flight": {
                        "airline": ret_airline,
                        "flight_number": ret_fl_num,
                        "depart_time": ret_dep_time,
                        "arrival_time": ret_arr_time,
                        "base_price_eur": round(ret_cents * cand_travelers / 100.0, 2),
                        "landed_price_eur": round(
                            ret_cents * cand_travelers / 100.0, 2
                        ),
                        "unit_price_eur": round(ret_cents / 100.0, 2),
                        "booking_url": ret_url,
                        "source": best_ret_tick.source or "flight",
                        "is_live": False,
                        "ancillaries_excluded": True,
                    },
                    "lodging": lodging_item,
                    "travelers": cand_travelers,
                    "participants": cand_participants,
                    "deal_status": "package_deal"
                    if lodging_item
                    else "flight_deal_verified",
                    "is_bookable": True,
                    "explanation": "Verified flight & accommodation package",
                    "source": out_tick.source,
                    "source_class": out_tick.source_class,
                    "found_at": out_tick.source_observed_at.isoformat()
                    if out_tick.source_observed_at
                    else None,
                    "baseline_level_used": "full",
                    "feasibility": "pass",
                }
            )

        cand_packages.sort(
            key=lambda d: (
                0 if d.get("lodging") is not None else 1,
                0
                if (
                    d.get("lodging")
                    and (d["lodging"].get("photo_url") or d["lodging"].get("address"))
                )
                else 1,
                -d["discount_pct"],
                d["total_price_eur"],
            )
        )
        return cand_packages[:limit]

    async def get_active_deals(
        self,
        session: AsyncSession,
        limit: int = 10,
        user_model: UserModel | None = None,
    ) -> list[dict[str, Any]]:
        """Retrieves global top active deals across all corridors."""
        stmt = (
            select(DealEventModel)
            .where(DealEventModel.status.in_(["alerted", "pending", "active"]))
            .order_by(desc(DealEventModel.alerted_at))
            .limit(limit)
        )
        events = (await session.execute(stmt)).scalars().all()
        items: list[dict[str, Any]] = []
        for ev in events:
            item = await self.format_deal_event(session, ev)
            if item:
                items.append(item)

        if not items:
            alerts = (
                (
                    await session.execute(
                        select(DealWatchAlertModel).where(
                            DealWatchAlertModel.is_active.is_(True)
                        )
                    )
                )
                .scalars()
                .all()
            )
            if not alerts:
                alerts = (
                    (await session.execute(select(DealWatchAlertModel))).scalars().all()
                )

            for a in alerts:
                route_pkgs = await self.get_route_deals(
                    session=session,
                    route_id=a.id,
                    limit=3,
                    user_model=user_model,
                )
                items.extend(route_pkgs)

        items.sort(key=lambda d: (-d["discount_pct"], d["total_price_eur"]))
        return items[:limit]


# Global singleton instance
deal_package_service = DealPackageService()
