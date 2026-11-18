import io
import json
import uuid
import zipfile
from datetime import datetime, timezone
from unittest.mock import AsyncMock, patch

import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.application.trip_editing.itinerary_editor import ItineraryEditor
from app.db.models import (
    TripCollectionModel,
    TripExpenseModel,
    TripModel,
    TripParticipantModel,
    TripTicketModel,
)
from app.domain.schemas.itinerary_document import ItineraryDocument
from app.services.place_import_service import (
    parse_google_maps_urls,
    parse_google_takeout_or_json,
    parse_gpx,
    parse_kml_or_kmz,
)
from app.services.travel_document_scanner import scan_expense_receipt


async def _register_and_auth_headers(
    async_client: AsyncClient,
) -> tuple[dict[str, str], str]:
    uid = uuid.uuid4().hex[:8]
    res = await async_client.post(
        "/api/auth/register",
        json={
            "email": f"traveler_{uid}@paladio.com",
            "username": f"traveler_{uid}",
            "password": "strongpassword123",
        },
    )
    assert res.status_code == 201, res.text
    data = res.json()
    return {"Authorization": f"Bearer {data['access_token']}"}, data["user"]["id"]


def test_scan_expense_receipt_unit():
    receipt_txt = (
        "RAMEN ICHIRAN SHIBUYA\n"
        "2026-10-14 19:45\n"
        "Tonkotsu Ramen   1200\n"
        "Subtotal         1200\n"
        "TOTAL            ¥1,450\n"
    ).encode("utf-8")

    parsed = scan_expense_receipt(receipt_txt, "ichiran.txt", fallback_currency="EUR")
    assert parsed["description"] == "RAMEN ICHIRAN SHIBUYA"
    assert parsed["amount"] == 1450.0
    assert parsed["currency"] == "JPY"
    assert parsed["category"] == "food"
    assert parsed["expense_date"] == "2026-10-14"

    euro_receipt = (
        "SNCF Train Ticket\n" "Date: 15/05/2026\n" "Montant Total: 42,80 €\n"
    ).encode("utf-8")
    parsed_eu = scan_expense_receipt(euro_receipt, "sncf.txt")
    assert parsed_eu["amount"] == 42.8
    assert parsed_eu["currency"] == "EUR"
    assert parsed_eu["category"] == "transport"
    assert parsed_eu["expense_date"] == "2026-05-15"


@pytest.mark.asyncio
async def test_scan_expense_receipt_endpoint(async_client: AsyncClient):
    headers, _ = await _register_and_auth_headers(async_client)
    receipt_bytes = b"Museo Nacional del Prado\n2026-06-20\nTotal EUR 15.00\n"
    res = await async_client.post(
        "/api/trips/expenses/scan-receipt",
        headers=headers,
        files={"file": ("prado_receipt.txt", receipt_bytes, "text/plain")},
        data={"default_currency": "EUR"},
    )
    assert res.status_code == 200, res.text
    body = res.json()
    assert body["description"] == "Museo Nacional del Prado"
    assert body["amount"] == 15.0
    assert body["currency"] == "EUR"
    assert body["category"] == "sightseeing"
    assert body["expense_date"] == "2026-06-20"


def test_itinerary_editor_shift_and_regenerate_ids():
    doc, _ = ItineraryDocument.from_dict(
        {
            "travel_constraints": {
                "start_date": "2026-07-01",
                "end_date": "2026-07-02",
                "hotel": {
                    "check_in_date": "2026-07-01",
                    "check_out_date": "2026-07-02",
                },
            },
            "days": [
                {
                    "day": 1,
                    "date": "2026-07-01",
                    "itinerary": {
                        "path": [{"stop_id": "stop-1", "poi": {"name": "Louvre"}}]
                    },
                },
                {
                    "day": 2,
                    "date": "2026-07-02",
                    "itinerary": {
                        "path": [{"stop_id": "stop-2", "poi": {"name": "Eiffel Tower"}}]
                    },
                },
            ],
        }
    )
    cs, delta = ItineraryEditor.shift_trip_dates(doc, "2026-07-11")
    assert cs.ok is True
    assert delta == 10
    assert doc.days[0].date == "2026-07-11"
    assert doc.days[1].date == "2026-07-12"
    assert doc.travel_constraints["start_date"] == "2026-07-11"
    assert doc.travel_constraints["end_date"] == "2026-07-12"
    assert doc.travel_constraints["hotel"]["check_in_date"] == "2026-07-11"

    old_ids = [
        doc.days[0].itinerary.path[0].stop_id,
        doc.days[1].itinerary.path[0].stop_id,
    ]
    ItineraryEditor.regenerate_stop_ids(doc)
    new_ids = [
        doc.days[0].itinerary.path[0].stop_id,
        doc.days[1].itinerary.path[0].stop_id,
    ]
    assert new_ids != old_ids


@pytest.mark.asyncio
async def test_shift_dates_and_duplicate_trip_endpoints(
    async_client: AsyncClient, db_session: AsyncSession
):
    headers, user_id = await _register_and_auth_headers(async_client)
    trip_id = str(uuid.uuid4())
    part_id = str(uuid.uuid4())
    ticket_id = str(uuid.uuid4())
    col_id = str(uuid.uuid4())

    trip = TripModel(
        id=trip_id,
        user_id=user_id,
        destination="Paris",
        start_date="2026-08-01",
        end_date="2026-08-02",
        itinerary_data={
            "title": "Paris Summer",
            "travel_constraints": {
                "start_date": "2026-08-01",
                "end_date": "2026-08-02",
            },
            "days": [
                {
                    "day": 1,
                    "date": "2026-08-01",
                    "itinerary": {
                        "path": [{"stop_id": "s1", "poi": {"name": "Orsay"}}]
                    },
                },
                {
                    "day": 2,
                    "date": "2026-08-02",
                    "itinerary": {
                        "path": [{"stop_id": "s2", "poi": {"name": "Louvre"}}]
                    },
                },
            ],
        },
        status="active",
        revision=0,
    )
    db_session.add(trip)
    await db_session.flush()

    db_session.add(
        TripParticipantModel(
            id=part_id,
            trip_id=trip_id,
            user_id=user_id,
            name="Tester",
            role="organizer",
        )
    )
    await db_session.flush()
    db_session.add(
        TripExpenseModel(
            id=str(uuid.uuid4()),
            trip_id=trip_id,
            payer_id=part_id,
            description="Train",
            amount=35.0,
            currency="EUR",
            category="transport",
            split_type="equal",
            splits=[],
            expense_date="2026-08-01",
        )
    )
    db_session.add(
        TripTicketModel(
            id=ticket_id,
            trip_id=trip_id,
            ticket_type="flight",
            title="MAD -> CDG",
            start_time=datetime(2026, 8, 1, 10, 0, tzinfo=timezone.utc),
            end_time=datetime(2026, 8, 1, 12, 0, tzinfo=timezone.utc),
            status="confirmed",
            source="manual",
        )
    )
    db_session.add(TripCollectionModel(id=col_id, trip_id=trip_id, name="Paris Spots"))
    await db_session.commit()

    # 1. Shift dates by +5 days
    shift_res = await async_client.post(
        f"/api/trips/{trip_id}/shift-dates",
        headers=headers,
        json={"new_start_date": "2026-08-06", "reanchor_bookings": True},
    )
    assert shift_res.status_code == 200, shift_res.text
    shifted = shift_res.json()
    assert shifted["start_date"] == "2026-08-06"
    assert shifted["end_date"] == "2026-08-07"
    assert shifted["itinerary_data"]["days"][0]["date"] == "2026-08-06"
    assert shifted["itinerary_data"]["days"][1]["date"] == "2026-08-07"

    exp_res = await async_client.get(f"/api/trips/{trip_id}/expenses", headers=headers)
    assert exp_res.status_code == 200
    assert exp_res.json()[0]["expense_date"] == "2026-08-06"

    # 2. Duplicate trip with optional new start date
    dup_res = await async_client.post(
        f"/api/trips/{trip_id}/duplicate",
        headers=headers,
        json={"new_start_date": "2026-09-01", "title_suffix": " (Autumn)"},
    )
    assert dup_res.status_code == 201, dup_res.text
    dup = dup_res.json()
    assert dup["id"] != trip_id
    assert dup["start_date"] == "2026-09-01"
    assert dup["end_date"] == "2026-09-02"
    assert dup["itinerary_data"]["title"] == "Paris Summer (Autumn)"
    assert dup["itinerary_data"]["days"][0]["itinerary"]["path"][0]["stop_id"] != "s1"


def test_place_import_parsers_unit():
    gpx = b"""<?xml version="1.0" encoding="UTF-8"?>
    <gpx version="1.1">
      <wpt lat="40.4138" lon="-3.6921">
        <name>Museo del Prado</name>
        <desc>Art museum in Madrid</desc>
        <type>museum</type>
      </wpt>
    </gpx>"""
    gpx_places = parse_gpx(gpx)
    assert len(gpx_places) == 1
    assert gpx_places[0].name == "Museo del Prado"
    assert gpx_places[0].category == "museum"

    kml = b"""<?xml version="1.0" encoding="UTF-8"?>
    <kml xmlns="http://www.opengis.net/kml/2.2">
      <Document>
        <Placemark>
          <name>Retiro Park</name>
          <description>Historic city park</description>
          <Point><coordinates>-3.6844,40.4153,0</coordinates></Point>
        </Placemark>
      </Document>
    </kml>"""
    assert parse_kml_or_kmz(kml, is_kmz=False)[0].name == "Retiro Park"

    kmz_buf = io.BytesIO()
    with zipfile.ZipFile(kmz_buf, "w") as zf:
        zf.writestr("doc.kml", kml)
    assert parse_kml_or_kmz(kmz_buf.getvalue(), is_kmz=True)[0].name == "Retiro Park"

    geojson = json.dumps(
        {
            "type": "FeatureCollection",
            "features": [
                {
                    "type": "Feature",
                    "geometry": {"type": "Point", "coordinates": [139.7005, 35.6595]},
                    "properties": {
                        "Title": "Shibuya Crossing",
                        "Location": {"Address": "Shibuya, Tokyo"},
                    },
                }
            ],
        }
    ).encode("utf-8")
    gj_places = parse_google_takeout_or_json(geojson, "Saved Places.json")
    assert len(gj_places) == 1
    assert gj_places[0].name == "Shibuya Crossing"
    assert abs(gj_places[0].lat - 35.6595) < 1e-4

    csv_data = (
        "Title,Note,URL\n"
        "Senso-ji,Temple,https://www.google.com/maps/place/Senso-ji/@35.714765,139.796655,17z\n"
    ).encode("utf-8")
    csv_places = parse_google_takeout_or_json(csv_data, "favorites.csv")
    assert len(csv_places) == 1
    assert csv_places[0].name == "Senso-ji"

    url_places = parse_google_maps_urls(
        [
            "https://www.google.com/maps/place/Tokyo+Tower/@35.65858,139.74543,17z",
            "https://www.google.com/maps/dir/35.65858,139.74543/35.71476,139.79665",
        ]
    )
    assert len(url_places) == 3
    assert url_places[0].name == "Tokyo Tower"


@pytest.mark.asyncio
async def test_import_places_into_collection_endpoint(
    async_client: AsyncClient, db_session: AsyncSession
):
    headers, user_id = await _register_and_auth_headers(async_client)
    trip_id = str(uuid.uuid4())
    col_id = str(uuid.uuid4())

    db_session.add(
        TripModel(
            id=trip_id,
            user_id=user_id,
            destination="Madrid",
            start_date="2026-09-10",
            end_date="2026-09-12",
            itinerary_data={"days": []},
            status="active",
            revision=0,
        )
    )
    await db_session.flush()
    db_session.add(
        TripCollectionModel(id=col_id, trip_id=trip_id, name="Imported Gems")
    )
    await db_session.commit()

    unique_name = f"Hidden Lookout {trip_id[:8]}"
    gpx = f"""<?xml version="1.0" encoding="UTF-8"?>
    <gpx version="1.1">
      <wpt lat="40.4155" lon="-3.7074"><name>Plaza Mayor</name><type>attraction</type></wpt>
      <wpt lat="40.4201" lon="-3.7001"><name>{unique_name}</name><type>attraction</type></wpt>
    </gpx>""".encode("utf-8")

    async def _fake_embed(texts, **_kwargs):
        return [[0.01] * 768 for _ in texts]

    with patch(
        "app.services.place_import_service.OnnxEmbeddingProvider.embed_batch",
        new=AsyncMock(side_effect=_fake_embed),
    ):
        res = await async_client.post(
            f"/api/trips/{trip_id}/collections/{col_id}/import",
            headers=headers,
            files={"file": ("madrid.gpx", gpx, "application/gpx+xml")},
            data={"city": "Madrid"},
        )

    assert res.status_code == 200, res.text
    body = res.json()
    assert body["imported_count"] == 2
    assert body["created_pois_count"] >= 1
    assert body["created_pois_count"] + body["matched_existing_count"] == 2
    assert len(body["poi_ids"]) == 2
