from datetime import datetime, timezone, timedelta
import shutil
from unittest.mock import patch

import pytest
from httpx import AsyncClient


@pytest.mark.asyncio
async def test_locations_search_dynamic(async_client: AsyncClient):
    # Test query for Madrid
    res = await async_client.get("/api/locations/search?q=Madrid")
    assert res.status_code == 200
    data = res.json()
    assert len(data) > 0
    assert any(
        item["city"] == "Madrid" and item["airport_iata"] == "MAD" for item in data
    )

    # Test query for Paris (multi-airport: both CDG and ORY must be present and distinct)
    res_paris = await async_client.get("/api/locations/search?q=Paris")
    assert res_paris.status_code == 200
    data_paris = res_paris.json()
    assert len(data_paris) > 0
    paris_iatas = [item["airport_iata"] for item in data_paris]
    assert "CDG" in paris_iatas
    assert "ORY" in paris_iatas
    # Ensure no duplicates in returned results
    assert len(paris_iatas) == len(set(paris_iatas))

    # Test IATA direct search
    res_iata = await async_client.get("/api/locations/search?q=JFK")
    assert res_iata.status_code == 200
    data_iata = res_iata.json()
    assert len(data_iata) > 0
    assert data_iata[0]["airport_iata"] == "JFK"


@pytest.mark.asyncio
async def test_scan_boarding_pass_for_new_trip(async_client: AsyncClient):
    # Standard IATA BCBP string with future date (e.g. +14 days)
    future_date = datetime.now(timezone.utc).date() + timedelta(days=14)
    future_julian = future_date.timetuple().tm_yday
    sample_bcbp = (
        f"M1GARCIA/CARLOS       EIB1234 MADSVQIB 3166 {future_julian:03d}Y012A0001 100"
    )
    res = await async_client.post(
        "/api/trips/scan-boarding-pass",
        data={"raw_text": sample_bcbp},
    )
    assert res.status_code == 200
    data = res.json()
    assert data["origin_iata"] == "MAD"
    assert data["destination_iata"] == "SVQ"
    assert data["origin_city"] == "Madrid"
    assert data["destination_city"] in ["Sevilla", "Seville"]
    assert "3166" in data["flight_number"]
    assert data["departure_date"] == future_date.isoformat()


@pytest.mark.asyncio
async def test_scan_boarding_pass_past_date_rejected(async_client: AsyncClient):
    # Pass with departure date preceding current date must be rejected with 400
    past_date = datetime.now(timezone.utc).date() - timedelta(days=5)
    past_julian = past_date.timetuple().tm_yday
    sample_bcbp = (
        f"M1GARCIA/CARLOS       EIB1234 MADSVQIB 3166 {past_julian:03d}Y012A0001 100"
    )
    res = await async_client.post(
        "/api/trips/scan-boarding-pass",
        data={"raw_text": sample_bcbp},
    )
    assert res.status_code == 400
    data = res.json()
    assert "precedes the current date" in data["detail"]


@pytest.mark.asyncio
async def test_scan_boarding_pass_invalid_date_range_rejected(
    async_client: AsyncClient,
):
    # Return date preceding departure date must be rejected with 400
    flight_text = """
    AIRLINE CONFIRMATION - FLIGHT AF1234
    Booking Ref: PNR789
    Departure: 2026-11-20 Departs: 07:30 MAD Madrid
    Arrival: Lands: 09:45 CDG Paris
    Return flight: 2026-11-10 Departure: 19:15 CDG Paris to MAD
    """
    res = await async_client.post(
        "/api/trips/scan-boarding-pass",
        data={"raw_text": flight_text},
    )
    assert res.status_code == 400
    data = res.json()
    assert "precedes departure date" in data["detail"]


@pytest.mark.asyncio
async def test_create_trip_with_participants(async_client: AsyncClient):
    payload = {
        "destination": "Paris",
        "start_date": "2026-11-01T09:00:00Z",
        "end_date": "2026-11-06T20:00:00Z",
        "itinerary_data": {
            "title": "Trip to Paris",
            "participants": [
                {"name": "Sarah Connor", "is_guest": True},
                {
                    "name": "John Doe",
                    "email": "john@example.com",
                    "user_id": "u-123",
                    "is_guest": False,
                },
            ],
            "days": [],
        },
    }
    with patch("app.engine.city_readiness.ensure_city_ready"):
        res = await async_client.post("/api/trips/", json=payload)
    assert res.status_code == 201
    data = res.json()
    assert data["destination"] == "Paris"
    participants = data.get("participants", [])
    names = [p["name"] for p in participants]
    assert "Sarah Connor" in names
    assert "John Doe" in names


@pytest.mark.asyncio
async def test_scan_flight_with_landing_and_takeoff_hours(async_client: AsyncClient):
    flight_text = """
    AIRLINE CONFIRMATION - FLIGHT AF1234
    Booking Ref: PNR789
    Departure: 2026-11-10 Departs: 07:30 MAD Madrid
    Arrival: Lands: 09:45 CDG Paris
    Return flight: 2026-11-15 Departure: 19:15 CDG Paris to MAD
    """
    res = await async_client.post(
        "/api/trips/scan-boarding-pass",
        data={"raw_text": flight_text},
    )
    assert res.status_code == 200
    data = res.json()
    assert data["document_type"] == "flight"
    assert data["origin_iata"] == "MAD"
    assert data["destination_iata"] == "CDG"
    assert data["departure_date"] == "2026-11-10"
    assert data["return_date"] == "2026-11-15"
    assert data["flight_departure_hour"] == "07:30"
    assert data["flight_arrival_hour"] == "09:45"
    # User rule verification:
    # Trip start hour in destination is determined by flight landing arrival
    assert data["departure_hour"] == "09:45"
    # Trip end hour in destination is determined by outbound flight takeoff departure
    assert data["arrival_hour"] == "19:15"


@pytest.mark.asyncio
async def test_scan_hotel_booking_document(async_client: AsyncClient):
    hotel_text = """
    HOTEL RESERVATION CONFIRMATION
    Hotel: Grand Hotel Tokyo Central
    Reservation: BK98765
    City: Tokyo
    Check-in: 2026-12-01 from 15:00
    Check-out: 2026-12-08 until 11:00
    Door code: 4589
    """
    res = await async_client.post(
        "/api/trips/scan-boarding-pass",
        data={"raw_text": hotel_text},
    )
    assert res.status_code == 200
    data = res.json()
    assert data["document_type"] == "hotel"
    assert "Tokyo" in data["destination_city"]
    assert data["departure_date"] == "2026-12-01"
    assert data["return_date"] == "2026-12-08"
    assert data["check_in_hour"] == "15:00"
    assert data["check_out_hour"] == "11:00"
    assert data["departure_hour"] == "15:00"
    assert data["arrival_hour"] == "11:00"
    assert "Grand Hotel" in (data["hotel_name"] or "")


@pytest.mark.asyncio
@pytest.mark.skipif(
    shutil.which("tesseract") is None,
    reason="Tesseract OCR binary not installed in test environment",
)
async def test_scan_image_with_tesseract_ocr(async_client: AsyncClient):
    import io
    import os
    from PIL import Image, ImageDraw, ImageFont

    font = None
    for font_path in [
        "/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf",
        "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
        "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
    ]:
        if os.path.exists(font_path):
            try:
                font = ImageFont.truetype(font_path, 24)
                break
            except Exception:
                pass
    if font is None:
        font = ImageFont.load_default()

    img = Image.new("RGB", (500, 160), color="white")
    draw = ImageDraw.Draw(img)
    draw.text(
        (10, 10),
        "Flight IB3166\nMAD to SVQ\nDeparture: 2026-11-20\nDeparts: 08:30 Arrives: 09:45",
        font=font,
        fill="black",
    )
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    buf.seek(0)

    files = {"file": ("screenshot.png", buf.getvalue(), "image/png")}
    res = await async_client.post("/api/trips/scan-boarding-pass", files=files)
    assert res.status_code == 200
    data = res.json()
    assert data["document_type"] == "flight"
    assert data["origin_iata"] == "MAD"
    assert data["destination_iata"] == "SVQ"
    assert data["departure_hour"] == "09:45"
    assert data["flight_departure_hour"] == "08:30"
    assert data["flight_arrival_hour"] == "09:45"


@pytest.mark.asyncio
async def test_scan_ryanair_boarding_pass_ocr(async_client: AsyncClient):
    raw_ocr_past = (
        "Lynsey-Anne Duncan-Williams\n\n"
        "Queue\nPriority\nBoarding\nFront Door\n\n"
        "Seat\nSeq Booking ref\n"
        "28A Window 123 OSGTSE\n\n"
        "RYANAIR FR112\n\n"
        "DUB —— MAD\n\n"
        "Dublin Madrid\n\n"
        "Date Boarding Departs\n"
        "18 Sep 2015 12.35 13:05"
    )

    # 1. Historical pass with 2015 date must be rejected when creating a trip
    res_past = await async_client.post(
        "/api/trips/scan-boarding-pass", data={"raw_text": raw_ocr_past}
    )
    assert res_past.status_code == 400
    assert "precedes the current date" in res_past.json()["detail"]

    # 2. Upcoming pass with valid future date must succeed
    raw_ocr_future = (
        "Lynsey-Anne Duncan-Williams\n\n"
        "Queue\nPriority\nBoarding\nFront Door\n\n"
        "Seat\nSeq Booking ref\n"
        "28A Window 123 OSGTSE\n\n"
        "RYANAIR FR112\n\n"
        "DUB —— MAD\n\n"
        "Dublin Madrid\n\n"
        "Date Boarding Departs\n"
        "18 Nov 2026 12.35 13:05"
    )

    res = await async_client.post(
        "/api/trips/scan-boarding-pass", data={"raw_text": raw_ocr_future}
    )
    assert res.status_code == 200
    data = res.json()
    assert data["document_type"] == "flight"
    assert data["origin_iata"] == "DUB"
    assert data["origin_city"] == "Dublin"
    assert data["destination_iata"] == "MAD"
    assert data["destination_city"] == "Madrid"
    assert data["flight_number"] == "FR112"
    assert data["carrier"] == "Ryanair"
    assert data["seat"] == "28A"
    assert data["reference_code"] == "OSGTSE"
    assert data["holder_name"] == "Lynsey-Anne Duncan-Williams"
    assert data["departure_date"] == "2026-11-18"
    assert data["flight_departure_hour"] == "13:05"


@pytest.mark.asyncio
async def test_hotel_search_and_reverse_geocode(async_client: AsyncClient):
    # Test hotel search by name and city
    res_hotel = await async_client.get(
        "/api/locations/hotels?city=Paris&q=Hilton&limit=3"
    )
    assert res_hotel.status_code == 200
    data_hotel = res_hotel.json()
    assert isinstance(data_hotel, list)
    if len(data_hotel) > 0:
        item = data_hotel[0]
        assert "name" in item
        assert "lat" in item
        assert "lng" in item

    # Test reverse geocode
    res_reverse = await async_client.get(
        "/api/locations/reverse?lat=48.8566&lon=2.3522"
    )
    assert res_reverse.status_code == 200
    data_reverse = res_reverse.json()
    assert "lat" in data_reverse
    assert "lng" in data_reverse
    assert "name" in data_reverse
