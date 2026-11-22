from datetime import date, timedelta
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock
from uuid import uuid4

import pytest
from sqlalchemy import delete

from app.engine.trip_frame import build_trip_frame
from app.infrastructure.providers.travel_data import DefaultTravelDataProvider
from app.schemas.itinerary import (
    BookingAnchors,
    FlightSegment,
    HotelAnchor,
    MealRequirement,
    TravelConstraints,
)
from app.services.airport_service import get_airport_service
from app.services.travel_document_scanner import (
    extract_dates_from_text,
    parse_iata_bcbp,
)
from app.swarm.nodes.guardrails import _find_overlapping_trip
from app.use_cases.fetch_travel_context import FetchTravelContextUseCase
from app.wallet.seeding import extract_itinerary_seeds


def test_airport_service_secondary_match_returns_orly():
    svc = get_airport_service()
    results = svc.search_locations("Orly", limit=5)
    iatas = [item["airport_iata"] for item in results]
    assert "ORY" in iatas


@pytest.mark.asyncio
async def test_resolve_airport_fallback_includes_coordinates(async_client):
    res = await async_client.get("/api/locations/resolve-airport?city=ORY")
    assert res.status_code == 200
    data = res.json()
    assert data["iata"] == "ORY"
    assert isinstance(data.get("latitude"), float)
    assert isinstance(data.get("longitude"), float)


@pytest.mark.asyncio
async def test_hotels_endpoint_reads_attraction_location_jsonb(
    async_client, db_session
):
    from app.db.models import AttractionModel

    await db_session.execute(
        delete(AttractionModel).where(AttractionModel.id == "hotel-test-jsonb-1")
    )
    await db_session.commit()

    poi = AttractionModel(
        id=f"hotel-test-jsonb-{uuid4().hex[:8]}",
        city="Testville",
        name="Testville Grand Hotel",
        category="hotel",
        location={"latitude": 48.1234, "longitude": 2.5678},
        scoring={"rating": 4.5},
        metadata_field={"address": "10 Rue Testville"},
        neighborhood="Central",
    )
    db_session.add(poi)
    await db_session.flush()

    res = await async_client.get("/api/locations/hotels?city=Testville&q=Grand&limit=1")
    assert res.status_code == 200
    items = res.json()
    assert any(
        i["name"] == "Testville Grand Hotel"
        and i["lat"] == pytest.approx(48.1234)
        and i["lng"] == pytest.approx(2.5678)
        and i["address"] == "10 Rue Testville"
        for i in items
    )


def test_yearless_next_year_bcbp_and_text_dates_roll_forward():
    today = date.today()
    # A date >180 days ago in the current year (e.g. Jan 15 when today is in Nov) wraps to next year
    if today.month >= 8:
        bcbp = "M1GARCIA/CARLOS       EIB1234 MADCDGIB 3400 015Y012A0001 100"
        parsed = parse_iata_bcbp(bcbp, trip_start_year=today.year)
        assert parsed is not None
        assert parsed["flight_date"] == f"{today.year + 1}-01-15"

        dates = extract_dates_from_text("Departure: 15 Jan", trip_start_year=today.year)
        assert f"{today.year + 1}-01-15" in dates


@pytest.mark.asyncio
async def test_fetch_travel_context_preserves_pinned_hotel_and_handles_mismatch():
    provider = MagicMock(spec=DefaultTravelDataProvider)
    provider.get_pois = AsyncMock(
        return_value=[{"location": {"latitude": 48.8566, "longitude": 2.3522}}]
    )
    provider.get_restaurants = AsyncMock(return_value=[])
    provider.generate_mock_context = AsyncMock(return_value={})
    use_case = FetchTravelContextUseCase(data_provider=provider)

    # 1. Pinned hotel lat/lng must be preserved without overwriting via Nominatim
    constraints_pinned = TravelConstraints(
        destination_city="Paris",
        origin_city="Madrid",
        start_date=date.today() + timedelta(days=10),
        end_date=date.today() + timedelta(days=12),
        booking_anchors=BookingAnchors(
            hotel=HotelAnchor(
                name="Stay in Paris",
                city="Paris",
                lat=48.8651,
                lng=2.3282,
            )
        ),
    )
    res_pinned = await use_case.execute(constraints_pinned)
    hotel_pois = [
        p for p in res_pinned["daily_pois_data"][0] if p.get("category") == "HOTEL"
    ]
    assert len(hotel_pois) == 1
    assert hotel_pois[0]["location"]["latitude"] == pytest.approx(48.8651)
    assert hotel_pois[0]["location"]["longitude"] == pytest.approx(2.3282)

    # 2. Hotel city mismatch must NOT raise UnboundLocalError
    constraints_mismatch = TravelConstraints(
        destination_city="Paris",
        origin_city="Madrid",
        start_date=date.today() + timedelta(days=10),
        end_date=date.today() + timedelta(days=12),
        booking_anchors=BookingAnchors(
            hotel=HotelAnchor(name="Wrong City Hotel", city="Lyon")
        ),
    )
    res_mismatch = await use_case.execute(constraints_mismatch)
    assert "daily_pois_data" in res_mismatch


@pytest.mark.asyncio
async def test_guardrails_overlap_normalizes_iso_timestamps_and_skips_deals():
    existing = [
        {
            "id": "deal-1",
            "destination": "Paris",
            "start_date": "2026-12-08T00:00:00.000Z",
            "end_date": "2026-12-12T00:00:00.000Z",
            "status": "deal_proposal",
        },
        {
            "id": "active-1",
            "destination": "Rome",
            "start_date": "2026-12-10T00:00:00.000Z",
            "end_date": "2026-12-14T00:00:00.000Z",
            "status": "active",
        },
    ]
    # Deal proposal on 2026-12-08..2026-12-09 must be ignored; boundary overlap on 2026-12-10 must be caught
    assert (
        await _find_overlapping_trip(
            "2026-12-08", "2026-12-09", existing_trips=existing
        )
        is None
    )
    hit = await _find_overlapping_trip(
        "2026-12-05", "2026-12-10", existing_trips=existing
    )
    assert hit is not None
    assert hit["id"] == "active-1"


def test_extract_itinerary_seeds_deduplicates_scanned_flight_and_hotel():
    trip = SimpleNamespace(
        id="trip-dedup-1",
        destination="Paris",
        start_date="2026-12-10",
        end_date="2026-12-14",
        itinerary_data={
            "outbound_flight": {
                "origin_iata": "MAD",
                "destination_iata": "CDG",
                "departure_time": "2026-12-10T07:15:00",
                "arrival_time": "2026-12-10T09:15:00",
                "flight_number": "IB3400",
            },
            "hotel": {
                "name": "Hotel Le Meurice",
                "address": "228 Rue de Rivoli",
                "check_in_date": "2026-12-10",
                "check_out_date": "2026-12-14",
            },
            "scanned_documents": [
                {
                    "ticket_type": "flight",
                    "title": "IB3400 MAD -> CDG",
                    "reference_code": "PNR1",
                    "status": "confirmed",
                    "metadata": {
                        "origin_iata": "MAD",
                        "destination_iata": "CDG",
                        "flight_number": "IB3400",
                    },
                },
                {
                    "ticket_type": "hotel",
                    "title": "Hotel Le Meurice",
                    "reference_code": "HTL1",
                    "status": "confirmed",
                    "metadata": {"hotel_name": "Hotel Le Meurice"},
                },
            ],
            "days": [],
        },
    )
    seeds, _ = extract_itinerary_seeds(trip)
    flight_seeds = [s for s in seeds if s["ticket_type"] == "flight"]
    hotel_seeds = [s for s in seeds if s["ticket_type"] == "hotel"]
    assert len(flight_seeds) == 1
    assert flight_seeds[0]["source"] == "scan"
    assert len(hotel_seeds) == 1
    assert hotel_seeds[0]["source"] == "scan"


def test_build_trip_frame_preserves_arrival_buffer_on_same_day_and_early_breakfast():
    # Single-day trip arriving at 08:00 (buffered start = 10:00 = 600 mins) and departing 20:00
    constraints = TravelConstraints(
        destination_city="Paris",
        start_date=date(2026, 12, 10),
        end_date=date(2026, 12, 10),
        meals=[
            MealRequirement(
                meal_type="BREAKFAST", start_time="08:00", end_time="10:00"
            ),
            MealRequirement(meal_type="LUNCH", start_time="12:30", end_time="14:30"),
        ],
        booking_anchors=BookingAnchors(
            outbound_flight=FlightSegment(
                origin_iata="MAD",
                destination_iata="CDG",
                departure_time="2026-12-10T06:00:00",
                arrival_time="2026-12-10T08:00:00",
            ),
            return_flight=FlightSegment(
                origin_iata="CDG",
                destination_iata="MAD",
                departure_time="2026-12-10T20:00:00",
                arrival_time="2026-12-10T22:00:00",
            ),
        ),
    )
    frame = build_trip_frame(constraints, city_center=(48.8566, 2.3522))
    assert len(frame.days) == 1
    # Arrival at 08:00 + 120m buffer = 600 mins must NOT be pulled backward to 08:00 breakfast or departure
    assert frame.days[0].start_time_mins >= 600
