"""
Paladio Deal Engine Domain Protocols (Ports).
Decouples Deal Engine core logic from direct imports of infrastructure / adapters.
"""

from dataclasses import dataclass
from datetime import date, datetime
from typing import Any, Protocol


@dataclass
class FlightQuote:
    origin_iata: str
    destination_iata: str
    destination_city_id: str
    depart_time: datetime
    arrival_time: datetime
    base_price_cents: int
    currency: str
    carrier: str
    flight_number: str | None = None
    stops: int = 0
    deep_link: str | None = None


@dataclass
class LodgingQuote:
    destination_code: str
    check_in: date
    check_out: date
    base_price_per_night_cents: int
    currency: str
    quality_score: float = 75.0
    property_name: str | None = None
    property_id: str | None = None
    estimated_fee_ratio: float = 1.15
    deep_link: str | None = None


@dataclass
class GateResult:
    gates_passed: bool
    realism: float
    details: dict[str, Any]


class LodgingScorer(Protocol):
    """Wraps HybridSovereignScorer.batch_score; returns quality 0-100 per property."""

    def score(
        self, properties: list[LodgingQuote], taste: Any | None
    ) -> list[float]: ...


class ItineraryGate(Protocol):
    """Wraps run_itinerary_pipeline + evaluate_itinerary_quality."""

    async def evaluate(
        self, package: dict[str, Any], taste: Any | None
    ) -> GateResult: ...


class Notifier(Protocol):
    """Pushes verified deal alert events to users via Redis Pub/Sub / WebSockets."""

    def push(
        self, user_id: str, deal_event_id: str, payload: dict[str, Any]
    ) -> None: ...


class FlightFeed(Protocol):
    """Tier 1 Flight Feed port."""

    async def fetch_cached_flights(
        self, origin_iata: str, dest_iata: str, date_from: date, date_to: date
    ) -> list[FlightQuote]: ...


class LodgingFeed(Protocol):
    """Tier 1 Lodging Feed port."""

    async def fetch_destination_summary(
        self,
        destination_code: str,
        check_in: date,
        check_out: date,
        session: Any | None = None,
    ) -> LodgingQuote: ...


class LiveQuoteProvider(Protocol):
    """Tier 2 / Tier 3 live quote verification port."""

    async def verify_flight(
        self, quote: FlightQuote
    ) -> tuple[bool, int, dict[str, Any]]: ...

    async def verify_lodging(
        self, quote: LodgingQuote
    ) -> tuple[bool, int, dict[str, Any]]: ...
