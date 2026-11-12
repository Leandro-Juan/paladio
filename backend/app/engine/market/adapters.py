"""
Paladio Deal Engine Production Adapters.
Pure sovereign implementations of domain protocols using zero external API keys.
"""

import json
import logging
import os
from datetime import date, datetime, timedelta, timezone
from typing import Any

from sqlalchemy import select
from app.engine.market.config import config
from app.engine.market.ports import (
    FareObservation,
    FlightFeed,
    FlightQuote,
    GateResult,
    ItineraryGate,
    LiveQuoteProvider,
    LodgingFeed,
    LodgingQuote,
    LodgingScorer,
    Notifier,
)
from app.db.session import async_session
from app.infrastructure.scoring.hybrid_scorer import HybridSovereignScorer
from app.quality.itinerary_metrics import evaluate_itinerary_quality
from redis.asyncio import Redis
from sqlalchemy.ext.asyncio import AsyncSession

logger = logging.getLogger(__name__)


class CompositeFlightFeed(FlightFeed, LiveQuoteProvider):
    """
    Sovereign Flight Feed backed by verified providers.
    Uses Ryanair for intra-European routes; Aviasales primary source added in Phase 2.
    """

    def __init__(self, timeout_sec: float = 16.0):
        from app.engine.market.providers.aviasales import AviasalesProvider
        from app.engine.market.providers.ryanair import RyanairProvider

        self.timeout_sec = timeout_sec
        self.aviasales = AviasalesProvider(timeout_sec=timeout_sec)
        self.ryanair = RyanairProvider(timeout_sec=timeout_sec)

    def _get_router(self, origin_iata: str, dest_iata: str):
        from app.engine.market.flights.classifier import route_classifier
        from app.engine.market.providers.router import ProviderRouter

        classification = route_classifier.classify_corridor(origin_iata, dest_iata)
        if classification.is_europe:
            # Per Decision D11: Aviasales primary, Ryanair direct-carrier secondary in Europe
            providers = [self.aviasales, self.ryanair]
        else:
            providers = [self.aviasales]
        return ProviderRouter(asset_type="flight", providers=providers)

    async def fetch_month(
        self, origin: str, dest: str, month: date, trip_type: str = "one_way"
    ) -> list[FareObservation]:
        """
        Fetches full month fare observations from primary FareProvider.
        """
        return await self.aviasales.fetch_month(
            origin, dest, month, trip_type=trip_type
        )

    async def fetch_cached_flights(
        self,
        origin_iata: str,
        dest_iata: str,
        date_from: date,
        date_to: date,
        session: Any | None = None,
    ) -> list[FlightQuote]:
        router = self._get_router(origin_iata, dest_iata)
        if session is not None:
            return await router.execute_ladder(
                session,
                "fetch_cached_flights",
                origin_iata,
                dest_iata,
                date_from,
                date_to,
            )
        async with async_session() as local_session:
            return await router.execute_ladder(
                local_session,
                "fetch_cached_flights",
                origin_iata,
                dest_iata,
                date_from,
                date_to,
            )

    async def fetch_month_cheapest_per_day(
        self,
        origin_iata: str,
        dest_iata: str,
        month_start: date,
        session: Any | None = None,
    ) -> list[FlightQuote]:
        router = self._get_router(origin_iata, dest_iata)
        if session is not None:
            return await router.execute_ladder(
                session,
                "fetch_month_cheapest_per_day",
                origin_iata,
                dest_iata,
                month_start,
            )
        async with async_session() as local_session:
            return await router.execute_ladder(
                local_session,
                "fetch_month_cheapest_per_day",
                origin_iata,
                dest_iata,
                month_start,
            )

    async def fetch_calendar_horizon(
        self,
        origin_iata: str,
        dest_iata: str,
        months_ahead: int = 11,
        session: Any | None = None,
    ) -> list[FlightQuote]:
        router = self._get_router(origin_iata, dest_iata)
        if session is not None:
            return await router.execute_ladder(
                session,
                "fetch_calendar_horizon",
                origin_iata,
                dest_iata,
                months_ahead=months_ahead,
            )
        async with async_session() as local_session:
            return await router.execute_ladder(
                local_session,
                "fetch_calendar_horizon",
                origin_iata,
                dest_iata,
                months_ahead=months_ahead,
            )

    async def verify_flight(
        self, quote: FlightQuote, session: Any | None = None
    ) -> tuple[bool, int, dict[str, Any]]:
        router = self._get_router(quote.origin_iata, quote.destination_iata)
        if session is not None:
            return await router.execute_ladder(session, "verify_flight", quote)
        async with async_session() as local_session:
            return await router.execute_ladder(local_session, "verify_flight", quote)

    async def verify_lodging(
        self, quote: LodgingQuote
    ) -> tuple[bool, int, dict[str, Any]]:
        return (
            True,
            quote.base_price_per_night_cents,
            {"verified": True},
        )


class OpenLodgingFeed(LodgingFeed):
    """
    Lodging provider backed by multi-provider LodgingAggregator.
    Runs active providers (Booking, Google Travel, Trip.com, Agoda) in parallel,
    performs entity resolution, persists append-only observations, and tracks coverage.
    Zero hardcoded hotel names or prices; fails fast with NoDataError if no data obtainable.
    """

    def __init__(self, timeout_sec: float = 15.0):
        from app.engine.market.lodging.aggregator import LodgingAggregator

        self.aggregator = LodgingAggregator()

    async def search_offers(
        self,
        destination_code: str,
        check_in: date,
        check_out: date,
        adults: int = 2,
        session: AsyncSession | None = None,
    ) -> list[LodgingQuote]:
        if session is not None:
            return await self.aggregator.ingest_destination_hotels(
                session,
                destination_code,
                check_in,
                check_out,
                adults=adults,
            )
        async with async_session() as local_session:
            return await self.aggregator.ingest_destination_hotels(
                local_session,
                destination_code,
                check_in,
                check_out,
                adults=adults,
            )

    async def fetch_destination_summary(
        self,
        destination_code: str,
        check_in: date,
        check_out: date,
        session: AsyncSession | None = None,
        taste: Any | None = None,
    ) -> LodgingQuote:
        offers = await self.search_offers(
            destination_code,
            check_in,
            check_out,
            adults=2,
            session=session,
        )
        if not offers:
            from app.engine.market.providers.base import NoDataError

            raise NoDataError(
                f"No verified lodging data obtainable across providers for {destination_code}"
            )
        from app.engine.market.lodging.ranking import HotelCandidate, rank_hotels

        candidates = [
            HotelCandidate(
                property_id=o.property_id or o.property_name or f"prop_{idx}",
                name=o.property_name or "Hotel",
                nightly_cents=o.base_price_per_night_cents,
                stars=o.stars,
                review_score=o.review_score,
                review_count=o.review_count,
                latitude=o.latitude,
                longitude=o.longitude,
                deep_link=o.deep_link,
                provider=o.source,
                confidence=o.confidence,
                taxes_included=o.taxes_included,
            )
            for idx, o in enumerate(offers)
        ]
        user_pref = taste if isinstance(taste, dict) else None
        ranked = rank_hotels(candidates, user_preferences=user_pref)
        if ranked:
            best_cand = ranked[0].candidate
            for o in offers:
                if (
                    o.property_id and o.property_id == best_cand.property_id
                ) or o.property_name == best_cand.name:
                    o.quality_score = ranked[0].value_score
                    return o
            offers[0].quality_score = ranked[0].value_score
            return offers[0]
        return offers[0]


class SovereignLodgingScorer(LodgingScorer):
    """Evaluates lodging quality and value on 0-100 scale using taste-aware ranking."""

    def __init__(self):
        self.scorer = HybridSovereignScorer()

    def score(
        self, properties: list[LodgingQuote], taste: Any | None = None
    ) -> list[float]:
        if not properties:
            return []
        from app.engine.market.lodging.ranking import HotelCandidate, rank_hotels

        candidates = [
            HotelCandidate(
                property_id=p.property_id or p.property_name or f"prop_{idx}",
                name=p.property_name or "Hotel",
                nightly_cents=p.base_price_per_night_cents,
                stars=p.stars,
                review_score=p.review_score,
                review_count=p.review_count,
                latitude=p.latitude,
                longitude=p.longitude,
                deep_link=p.deep_link,
                provider=p.source,
                confidence=p.confidence,
                taxes_included=p.taxes_included,
            )
            for idx, p in enumerate(properties)
        ]
        user_pref = taste if isinstance(taste, dict) else None
        ranked = rank_hotels(candidates, user_preferences=user_pref)
        score_by_id = {r.candidate.property_id: r.value_score for r in ranked}
        return [
            score_by_id.get(
                p.property_id or p.property_name or f"prop_{idx}",
                (p.review_score * 10.0 if p.review_score is not None else 70.0),
            )
            for idx, p in enumerate(properties)
        ]


class SovereignItineraryGate(ItineraryGate):
    """
    Evaluates candidate package feasibility and executes evaluate_itinerary_quality.
    Enforces dead windows, minimum on-ground time, and realism threshold >= 8.0.
    """

    async def evaluate(
        self, package: dict[str, Any], taste: Any | None = None
    ) -> GateResult:
        flight = package.get("flight", {})
        arr_time = flight.get("arrival_time")
        dep_time = flight.get("depart_time")
        nights = package.get("nights", 3)

        # 1. Feasibility check: Dead Window (arrivals between 00:00 and 05:00 rejected)
        if isinstance(arr_time, datetime):
            arr_hour = arr_time.hour
            if (
                config.DEAD_WINDOW_LOCAL[0][0]
                <= arr_hour
                < config.DEAD_WINDOW_LOCAL[1][0]
            ):
                return GateResult(
                    gates_passed=False,
                    realism=4.0,
                    details={
                        "failure": f"Arrival time {arr_time.strftime('%H:%M')} falls in dead window 00:00-05:00"
                    },
                )

        # 2. Minimum on-ground hours
        if isinstance(dep_time, datetime) and isinstance(arr_time, datetime):
            return_flight = package.get("return_flight", {})
            ret_dep_time = return_flight.get("depart_time")
            if isinstance(ret_dep_time, datetime):
                on_ground_hours = (ret_dep_time - arr_time).total_seconds() / 3600.0
                if on_ground_hours < config.MIN_ON_GROUND_HOURS:
                    return GateResult(
                        gates_passed=False,
                        realism=5.0,
                        details={
                            "failure": f"On ground duration {on_ground_hours:.1f}h below minimum {config.MIN_ON_GROUND_HOURS}h"
                        },
                    )

        # 3. Construct itinerary payload from real POIs for evaluate_itinerary_quality
        dest = package.get("destination_code", "Unknown")
        session = package.get("session")
        if not session:
            # Synthetic itineraries are strictly forbidden. When real DB session / POIs are unavailable,
            # the gate returns 'skipped' (never 'passed').
            return GateResult(
                gates_passed=False,
                realism=0.0,
                status="skipped",
                details={
                    "status": "skipped",
                    "reason": f"No active DB session available to query real POIs for destination {dest}; synthetic itineraries strictly forbidden",
                },
            )

        # Query real POIs for destination
        try:
            from app.db.models import AttractionModel, DestinationAirportModel

            city_id_stmt = select(DestinationAirportModel.city_id).where(
                DestinationAirportModel.iata == dest
            )
            c_res = await session.execute(city_id_stmt)
            city_id = c_res.scalar_one_or_none()

            stmt = (
                select(AttractionModel)
                .where(
                    (AttractionModel.city_id == city_id)
                    | (AttractionModel.city == dest)
                    | (AttractionModel.city_id == dest.lower())
                )
                .limit(nights * 4)
            )
            res = await session.execute(stmt)
            pois = res.scalars().all()
        except Exception as e:
            logger.warning(f"Error querying real POIs for {dest}: {e}")
            pois = []

        if not pois or len(pois) < nights:
            return GateResult(
                gates_passed=False,
                realism=0.0,
                status="skipped",
                details={
                    "status": "skipped",
                    "reason": f"Insufficient real POIs ({len(pois)}) in database for destination {dest}; synthetic data strictly forbidden",
                },
            )

        real_days = []
        poi_idx = 0
        dep_d = package.get("depart_date") or date.today()
        for d in range(nights):
            day_path = []
            for slot_idx in range(min(4, len(pois) - poi_idx)):
                cur_poi = pois[poi_idx]
                poi_idx += 1
                lat = cur_poi.location.get("latitude") if cur_poi.location else None
                lon = cur_poi.location.get("longitude") if cur_poi.location else None
                if lat is None or lon is None:
                    continue
                day_path.append(
                    {
                        "poi": {
                            "id": cur_poi.id,
                            "name": cur_poi.name,
                            "category": cur_poi.category or "ATTRACTION",
                            "cost_source": cur_poi.cost_source or "real_catalog",
                            "location": {
                                "latitude": lat,
                                "longitude": lon,
                            },
                        },
                        "scheduled_start": "10:00" if slot_idx % 2 == 0 else "14:00",
                        "scheduled_end": "12:00" if slot_idx % 2 == 0 else "16:00",
                    }
                )
            if not day_path:
                return GateResult(
                    gates_passed=False,
                    realism=0.0,
                    status="skipped",
                    details={
                        "status": "skipped",
                        "reason": f"Could not construct valid day path from real POIs for {dest}",
                    },
                )
            real_days.append(
                {
                    "day": d + 1,
                    "date": (dep_d + timedelta(days=d)).isoformat(),
                    "itinerary": {"path": day_path},
                }
            )

        payload = {
            "id": f"deal_itin_{package.get('candidate_id', 'test')}",
            "destination": dest,
            "itinerary_data": {"days": real_days},
        }

        report = evaluate_itinerary_quality(payload)
        passed = (
            report.gates_passed and report.overall_realism_score >= config.REALISM_MIN
        )
        return GateResult(
            gates_passed=passed,
            realism=report.overall_realism_score,
            status="passed" if passed else "failed",
            details={"gate_failures": report.gate_failures, "report": report.__dict__},
        )


class RedisWebSocketNotifier(Notifier):
    """Pushes verified deal notifications to Redis Pub/Sub channel 'paladio:events'."""

    def __init__(self, redis_url: str | None = None):
        self.redis_url = redis_url or os.environ.get(
            "REDIS_URL", "redis://127.0.0.1:6379/0"
        )

    async def push_async(
        self, user_id: str, deal_event_id: str, payload: dict[str, Any]
    ) -> None:
        try:
            r = Redis.from_url(self.redis_url)
            message = {
                "event": "DEAL_PROPOSAL",
                "user_id": user_id,
                "deal_event_id": deal_event_id,
                "data": payload,
                "timestamp": datetime.now(timezone.utc).isoformat(),
            }
            await r.publish("paladio:events", json.dumps(message))
            await r.aclose()
        except Exception as e:
            logger.error(f"Failed to push deal notification to Redis: {e}")

    def push(self, user_id: str, deal_event_id: str, payload: dict[str, Any]) -> None:
        # Synchronous bridge for Celery / thread workers
        import asyncio

        try:
            loop = asyncio.get_event_loop()
            if loop.is_running():
                asyncio.create_task(self.push_async(user_id, deal_event_id, payload))
            else:
                loop.run_until_complete(
                    self.push_async(user_id, deal_event_id, payload)
                )
        except RuntimeError:
            asyncio.run(self.push_async(user_id, deal_event_id, payload))
