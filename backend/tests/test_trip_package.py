import os
import tempfile
import uuid
import zipfile
import pytest
from httpx import AsyncClient

from app.db.models import (
    TripCollectionItemModel,
    TripCollectionModel,
    TripExpenseModel,
    TripModel,
    TripParticipantModel,
    TripTicketModel,
)
from app.trip_package import (
    MIMETYPE_STR,
    TripPackager,
    TripPackageValidationError,
    TripUnpacker,
)


@pytest.fixture
def sample_trip_models():
    trip_id = str(uuid.uuid4())
    trip = TripModel(
        id=trip_id,
        destination="Kyoto, Japan",
        start_date="2026-11-10",
        end_date="2026-11-15",
        status="active",
        itinerary_data={
            "destination": "Kyoto, Japan",
            "days": [
                {
                    "day_number": 1,
                    "date": "2026-11-10",
                    "slots": [
                        {
                            "time": "09:00",
                            "name": "Fushimi Inari Shrine",
                            "coordinates": {"lat": 34.9671, "lon": 135.7727},
                            "duration_minutes": 120,
                        },
                        {
                            "time": "13:00",
                            "name": "Kiyomizu-dera",
                            "coordinates": {"lat": 34.9949, "lon": 135.7850},
                            "duration_minutes": 90,
                        },
                    ],
                }
            ],
            "routes": [{"mode": "transit", "polyline": "_p~iF~ps|U_ulLnnqC_mqNvxq`@"}],
            "travel_constraints": {"pace": "balanced", "budget_usd": 1500.0},
        },
    )

    participant = TripParticipantModel(
        id=str(uuid.uuid4()),
        trip_id=trip_id,
        user_id="user-123",
        name="Elena Rostova",
        email="elena@example.com",
        role="organizer",
    )

    expense = TripExpenseModel(
        id=str(uuid.uuid4()),
        trip_id=trip_id,
        payer_id=participant.id,
        description="Traditional Tea Ceremony",
        amount=120.0,
        currency="JPY",
        category="activities",
        split_type="equal",
        splits=[{"participant_id": participant.id, "share": 120.0}],
    )

    ticket = TripTicketModel(
        id=str(uuid.uuid4()),
        trip_id=trip_id,
        ticket_type="flight",
        title="Flight to Kansai Airport",
        provider="ANA",
        reference_code="CONF12345",
        holder_name="Elena Rostova",
        seat_or_room="14A",
        barcode_value="M1ROSTOVA/ELENA  ECONF12345",
        barcode_format="PDF417",
        ticket_metadata={"flight_number": "NH211"},
    )

    collection = TripCollectionModel(
        id=str(uuid.uuid4()),
        trip_id=trip_id,
        name="Zen Gardens",
        description="Must visit quiet gardens",
        color="#2D6A4F",
    )
    col_item = TripCollectionItemModel(
        id=str(uuid.uuid4()),
        collection_id=collection.id,
        poi_id="poi-ryoanji",
        notes="Visit early morning",
        order_index=0,
    )
    collection.items = [col_item]

    return {
        "trip": trip,
        "participants": [participant],
        "expenses": [expense],
        "tickets": [ticket],
        "collections": [collection],
    }


def test_trip_packager_and_unpacker_vault_profile(sample_trip_models):
    packager = TripPackager(
        trip=sample_trip_models["trip"],
        participants=sample_trip_models["participants"],
        expenses=sample_trip_models["expenses"],
        tickets=sample_trip_models["tickets"],
        collections=sample_trip_models["collections"],
        export_profile="full_vault",
    )

    with tempfile.TemporaryDirectory() as tmp_dir:
        target_package = os.path.join(tmp_dir, "kyoto.trip")
        created_path = packager.create_package(target_package)
        assert os.path.exists(created_path)

        # 1. Test zip container raw structure
        with zipfile.ZipFile(created_path, "r") as zf:
            members = zf.namelist()
            assert members[0] == "mimetype"
            info = zf.getinfo("mimetype")
            assert info.compress_type == zipfile.ZIP_STORED
            assert zf.read("mimetype").decode("ascii") == MIMETYPE_STR
            assert "paladio.json" in members
            assert "itinerary.json" in members
            assert "wallet.json" in members
            assert "expenses.json" in members
            assert "collections.json" in members

        # 2. Test Unpacker inspection and integrity
        unpacker = TripUnpacker(created_path)
        manifest = unpacker.inspect_manifest()
        assert manifest.format_version == "1.0.0"
        assert manifest.trip_id == sample_trip_models["trip"].id
        assert manifest.export_profile == "full_vault"
        assert manifest.destination == "Kyoto, Japan"
        assert manifest.bounding_box is not None
        assert manifest.bounding_box.min_lat <= 34.9671
        assert manifest.bounding_box.max_lat >= 34.9949

        is_valid, mismatches = unpacker.verify_integrity()
        assert is_valid, f"Integrity check failed: {mismatches}"

        # 3. Test full unpack
        extract_dir = os.path.join(tmp_dir, "extracted")
        unpacked_data = unpacker.unpack(extract_dir)

        assert unpacked_data["itinerary"]["destination"] == "Kyoto, Japan"
        assert len(unpacked_data["itinerary"]["days"]) == 1
        assert len(unpacked_data["wallet"]["tickets"]) == 1
        assert unpacked_data["wallet"]["tickets"][0]["reference_code"] == "CONF12345"
        assert len(unpacked_data["expenses"]["expenses"]) == 1
        assert (
            unpacked_data["expenses"]["participants"][0]["email"] == "elena@example.com"
        )
        assert len(unpacked_data["collections"]["collections"]) == 1


def test_trip_packager_community_shareable_profile(sample_trip_models):
    packager = TripPackager(
        trip=sample_trip_models["trip"],
        participants=sample_trip_models["participants"],
        expenses=sample_trip_models["expenses"],
        tickets=sample_trip_models["tickets"],
        collections=sample_trip_models["collections"],
        export_profile="community_shareable",
    )

    with tempfile.TemporaryDirectory() as tmp_dir:
        target_package = os.path.join(tmp_dir, "kyoto_shareable.trip")
        packager.create_package(target_package)

        unpacker = TripUnpacker(target_package)
        unpacked = unpacker.unpack()

        # Itinerary schedule and POIs remain intact
        assert len(unpacked["itinerary"]["days"]) == 1
        assert len(unpacked["itinerary"]["days"][0]["slots"]) == 2

        # Sensitive ticket data must be scrubbed
        ticket = unpacked["wallet"]["tickets"][0]
        assert "reference_code" not in ticket
        assert "barcode_payload" not in ticket
        assert "holder_name" not in ticket
        assert unpacked["wallet"]["attachments"] == []

        # Financials and participant PII must be scrubbed
        assert unpacked["expenses"]["expenses"] == []
        assert unpacked["expenses"]["settlement"] == {}
        assert len(unpacked["expenses"]["participants"]) == 1
        participant = unpacked["expenses"]["participants"][0]
        assert "email" not in participant
        assert participant["name"] == "Traveler 1"


def test_unpacker_security_zip_slip():
    with tempfile.TemporaryDirectory() as tmp_dir:
        evil_trip_path = os.path.join(tmp_dir, "evil.trip")
        with zipfile.ZipFile(evil_trip_path, "w") as zf:
            zf.writestr(
                "mimetype",
                MIMETYPE_STR.encode("ascii"),
                compress_type=zipfile.ZIP_STORED,
            )
            zf.writestr(
                "paladio.json",
                b'{"$schema":"https://paladio.app/schemas/v1/trip-package.json","format_version":"1.0.0","generator":{"name":"test","version":"1"},"trip_id":"evil","export_profile":"full_vault","created_at":"2026-11-04T00:00:00Z","title":"Evil","destination":"Nowhere","start_date":"2026-11-10","end_date":"2026-11-15","file_manifest":{}}',
            )
            zf.writestr(
                "itinerary.json",
                b'{"trip_id":"evil","destination":"Nowhere","start_date":"2026-11-10","end_date":"2026-11-15","days":[]}',
            )
            zf.writestr(
                "wallet.json", b'{"tickets":[],"booking_anchors":{},"attachments":[]}'
            )
            zf.writestr(
                "expenses.json",
                b'{"currency":"EUR","participants":[],"expenses":[],"settlement":{}}',
            )
            zf.writestr("collections.json", b'{"collections":[],"notes":[]}')
            # Inject zip-slip member
            zf.writestr("../../etc/passwd", b"root:x:0:0:")

        unpacker = TripUnpacker(evil_trip_path)
        extract_dir = os.path.join(tmp_dir, "output")
        with pytest.raises(TripPackageValidationError, match="Path traversal detected"):
            unpacker.unpack(extract_dir)


@pytest.mark.asyncio
async def test_trip_export_endpoint_integration(async_client: AsyncClient, monkeypatch):
    async def mock_async_noop(*args, **kwargs):
        return None

    async def mock_walking(itin, city=""):
        return itin

    monkeypatch.setattr(
        "app.services.transit_service.ensure_walking_legs_populated",
        mock_walking,
    )
    monkeypatch.setattr(
        "app.tasks.async_trigger_city_gtfs_download_if_needed",
        mock_async_noop,
    )
    monkeypatch.setattr(
        "app.engine.city_readiness.ensure_city_ready",
        mock_async_noop,
    )

    uid = uuid.uuid4().hex[:8]

    # 1. Register user
    reg_res = await async_client.post(
        "/api/auth/register",
        json={
            "email": f"export_user_{uid}@paladio.com",
            "username": f"export_user_{uid}",
            "password": "passwordExport123",
        },
    )
    assert reg_res.status_code == 201
    token = reg_res.json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}

    # 2. Create Trip
    create_res = await async_client.post(
        "/api/trips/",
        json={
            "destination": "Budapest, Hungary",
            "start_date": "2026-12-01",
            "end_date": "2026-12-05",
            "itinerary_data": {
                "days": [
                    {
                        "day_number": 1,
                        "date": "2026-12-01",
                        "slots": [
                            {
                                "name": "Széchenyi Thermal Bath",
                                "coordinates": {"lat": 47.5186, "lon": 19.0813},
                            }
                        ],
                    }
                ]
            },
        },
        headers=headers,
    )
    assert create_res.status_code == 201
    trip_id = create_res.json()["id"]

    # 3. Export trip via GET /api/trips/{trip_id}/export
    export_res = await async_client.get(
        f"/api/trips/{trip_id}/export?profile=full_vault",
        headers=headers,
    )
    assert export_res.status_code == 200
    assert export_res.headers.get("content-type") == MIMETYPE_STR
    assert "Budapest_Hungary" in export_res.headers.get("content-disposition", "")
    assert ".trip" in export_res.headers.get("content-disposition", "")

    # 4. Validate exported package using TripUnpacker
    with tempfile.NamedTemporaryFile(suffix=".trip", delete=False) as tf:
        tf.write(export_res.content)
        temp_export_path = tf.name

    try:
        unpacker = TripUnpacker(temp_export_path)
        manifest = unpacker.inspect_manifest()
        assert manifest.destination == "Budapest, Hungary"
        assert manifest.export_profile == "full_vault"
        valid, _ = unpacker.verify_integrity()
        assert valid
        data = unpacker.unpack()
        assert len(data["itinerary"]["days"]) == 1

        # 5. Test scan-boarding-pass endpoint with .trip file upload
        scan_res = await async_client.post(
            "/api/trips/scan-boarding-pass",
            files={"file": ("budapest.trip", export_res.content, MIMETYPE_STR)},
            headers=headers,
        )
        assert scan_res.status_code == 200, scan_res.text
        scan_data = scan_res.json()
        assert scan_data["destination_city"] == "Budapest, Hungary"
        assert scan_data["departure_date"] == "2026-12-01"
        assert scan_data["return_date"] == "2026-12-05"
        assert scan_data["document_type"] == "trip_package"

        # 6. Test import endpoint with .trip file upload
        import_res = await async_client.post(
            "/api/trips/import",
            files={"file": ("budapest.trip", export_res.content, MIMETYPE_STR)},
            headers=headers,
        )
        assert import_res.status_code == 201
        imported_trip = import_res.json()
        assert imported_trip["destination"] == "Budapest, Hungary"
        assert imported_trip["start_date"] == "2026-12-01"
        assert imported_trip["end_date"] == "2026-12-05"
        assert imported_trip["id"] != trip_id  # Mints a new trip ID cleanly
    finally:
        if os.path.exists(temp_export_path):
            os.unlink(temp_export_path)
