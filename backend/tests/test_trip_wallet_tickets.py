import uuid
import pytest
from httpx import AsyncClient
from sqlalchemy import select

from app.core.wallet_encryption import decrypt_wallet_secret
from app.db.models import TripTicketModel
from app.wallet.scan import parse_iata_bcbp
from sqlalchemy.ext.asyncio import AsyncSession


@pytest.mark.asyncio
async def test_wallet_tickets_crud_and_auth(
    async_client: AsyncClient, db_session: AsyncSession
):
    uid = uuid.uuid4().hex[:8]

    # Register User A (Alice)
    res_a = await async_client.post(
        "/api/v1/auth/register",
        json={
            "email": f"alice_{uid}@paladio.com",
            "username": f"alice_{uid}",
            "password": "Password123!",
        },
    )
    assert res_a.status_code == 201
    token_a = res_a.json()["access_token"]
    headers_a = {"Authorization": f"Bearer {token_a}"}

    # Register User B (Bob)
    res_b = await async_client.post(
        "/api/v1/auth/register",
        json={
            "email": f"bob_{uid}@paladio.com",
            "username": f"bob_{uid}",
            "password": "Password123!",
        },
    )
    assert res_b.status_code == 201
    token_b = res_b.json()["access_token"]
    headers_b = {"Authorization": f"Bearer {token_b}"}

    # Alice creates Trip 1
    create_trip_res = await async_client.post(
        "/api/v1/trips/",
        json={
            "destination": "Sevilla",
            "start_date": "2026-10-18T10:00:00",
            "end_date": "2026-10-23T15:00:00",
            "itinerary_data": {
                "outbound_flight": {
                    "origin_iata": "MAD",
                    "destination_iata": "SVQ",
                    "departure_time": "2026-10-18T10:00:00",
                    "arrival_time": "2026-10-18T11:05:00",
                    "flight_number": "IB3166",
                    "airline": "Iberia",
                },
                "inbound_flight": {
                    "origin_iata": "SVQ",
                    "destination_iata": "MAD",
                    "departure_time": "2026-10-23T14:00:00",
                    "arrival_time": "2026-10-23T15:05:00",
                    "flight_number": "IB3167",
                    "airline": "Iberia",
                },
                "travel_constraints": {
                    "hotel": {
                        "name": "Hotel Alfonso XIII",
                        "address": "Calle San Fernando 2, Sevilla",
                    }
                },
                "days": [
                    {
                        "day": 1,
                        "itinerary": {
                            "path": [
                                {
                                    "poi": {
                                        "id": "catedral_sevilla",
                                        "name": "Catedral de Sevilla",
                                        "category": "monument",
                                        "cost_eur": 12.0,
                                    },
                                    "scheduled_start": "16:00",
                                }
                            ]
                        },
                    }
                ],
            },
        },
        headers=headers_a,
    )
    assert create_trip_res.status_code == 201
    trip_id = create_trip_res.json()["id"]

    # 1. Verify auto-seeding on creation:
    # Expect 2 flight tickets + 1 hotel ticket = 3 seeded tickets
    tickets_res = await async_client.get(
        f"/api/v1/trips/{trip_id}/tickets", headers=headers_a
    )
    assert tickets_res.status_code == 200
    tickets = tickets_res.json()
    assert len(tickets) == 3

    # Check TripResponse contains tickets_count
    trip_get_res = await async_client.get(f"/api/v1/trips/{trip_id}", headers=headers_a)
    assert trip_get_res.status_code == 200
    assert trip_get_res.json()["tickets_count"] == 3

    # 2. Check Idempotent Sync:
    sync_res = await async_client.post(
        f"/api/v1/trips/{trip_id}/tickets/sync", headers=headers_a
    )
    assert sync_res.status_code == 200
    sync_data = sync_res.json()
    assert sync_data["created_count"] == 0
    assert len(sync_data["tickets"]) == 3

    # 3. Check Suggestions for Attraction:
    sugg_res = await async_client.get(
        f"/api/v1/trips/{trip_id}/tickets/suggestions", headers=headers_a
    )
    assert sugg_res.status_code == 200
    suggestions = sugg_res.json()
    assert len(suggestions) == 1
    assert suggestions[0]["name"] == "Catedral de Sevilla"

    # 4. Manual Ticket Creation:
    create_manual_res = await async_client.post(
        f"/api/v1/trips/{trip_id}/tickets",
        json={
            "ticket_type": "hotel",
            "title": "Apartamento Santa Cruz Access",
            "provider": "Airbnb",
            "access_code": "8492-PIN",
            "barcode_value": "QR-SECRET-9941",
            "barcode_format": "qr",
            "seat_or_room": "Door #3B",
            "status": "confirmed",
            "visibility": "private",  # Only Alice can see this!
        },
        headers=headers_a,
    )
    assert create_manual_res.status_code == 201
    manual_ticket = create_manual_res.json()
    ticket_id = manual_ticket["id"]
    assert manual_ticket["access_code"] == "8492-PIN"
    assert manual_ticket["barcode_value"] == "QR-SECRET-9941"

    # Verify Encryption at Rest:
    db_ticket = (
        await db_session.execute(
            select(TripTicketModel).where(TripTicketModel.id == ticket_id)
        )
    ).scalar_one()
    assert db_ticket.access_code != "8492-PIN"
    assert db_ticket.barcode_value != "QR-SECRET-9941"
    assert decrypt_wallet_secret(db_ticket.access_code) == "8492-PIN"

    # 5. Authorization and IDOR check:
    # Bob is NOT a participant yet, so Bob cannot access Alice's trip or private ticket
    bob_get_res = await async_client.get(
        f"/api/v1/trips/{trip_id}/tickets/{ticket_id}", headers=headers_b
    )
    assert bob_get_res.status_code in (403, 404)

    # 6. Ticket Update:
    update_res = await async_client.post(
        f"/api/v1/trips/{trip_id}/tickets",
        json={
            "ticket_type": "transit",
            "title": "Renfe AVE Sevilla -> Madrid",
            "provider": "Renfe",
            "status": "confirmed",
            "seat_or_room": "Coche 5, Plaza 12A",
        },
        headers=headers_a,
    )
    assert update_res.status_code == 201
    transit_id = update_res.json()["id"]

    edit_res = await async_client.put(
        f"/api/v1/trips/{trip_id}/tickets/{transit_id}",
        json={"seat_or_room": "Coche 5, Plaza 14B"},
        headers=headers_a,
    )
    assert edit_res.status_code == 200
    assert edit_res.json()["seat_or_room"] == "Coche 5, Plaza 14B"
    assert edit_res.json()["user_modified"] is True

    # 7. Delete Ticket:
    del_res = await async_client.delete(
        f"/api/v1/trips/{trip_id}/tickets/{transit_id}", headers=headers_a
    )
    assert del_res.status_code == 200

    # Verify 404 after deletion
    check_del = await async_client.get(
        f"/api/v1/trips/{trip_id}/tickets/{transit_id}", headers=headers_a
    )
    assert check_del.status_code == 404


@pytest.mark.asyncio
async def test_bcbp_and_scan_pipeline(async_client: AsyncClient):
    # Test deterministic IATA BCBP parser
    # Standard IATA BCBP string format:
    # M1DESMARAIS/LUC       EABC123 YULCDGAF 0346 291Y014A0024 100
    sample_bcbp = "M1GARCIA/CARLOS       EIB1234 MADSVQIB 3166 291Y012A0001 100"
    parsed = parse_iata_bcbp(sample_bcbp, trip_start_year=2026)
    assert parsed is not None
    assert parsed["holder_name"] == "GARCIA CARLOS"
    assert parsed["reference_code"] == "IB1234"
    assert parsed["origin_iata"] == "MAD"
    assert parsed["destination_iata"] == "SVQ"
    assert "3166" in parsed["flight_number"]
    assert parsed["seat"] == "012A"

    # Create dummy trip
    create_trip_res = await async_client.post(
        "/api/v1/trips/",
        json={
            "destination": "Madrid",
            "start_date": "2026-10-18T10:00:00",
            "end_date": "2026-10-23T15:00:00",
            "itinerary_data": {"days": []},
        },
    )
    assert create_trip_res.status_code == 201
    trip_id = create_trip_res.json()["id"]

    # Test scan endpoint with raw text containing hotel door code
    hotel_text = """
    Booking Confirmation: The Grand Luxury Hotel
    Check-in: 2026-10-18
    Room: Suite 402
    Door Code / Keypad PIN: 4921
    Address: Calle Sierpes 15, Sevilla
    Reservation Ref: HTL99421
    """
    scan_res = await async_client.post(
        f"/api/v1/trips/{trip_id}/tickets/scan",
        data={"raw_text": hotel_text},
    )
    assert scan_res.status_code == 200
    scan_data = scan_res.json()
    assert len(scan_data["drafts"]) > 0
    draft = scan_data["drafts"][0]
    assert draft["ticket_type"] == "hotel"
    assert draft["access_code"] == "4921"
    assert draft["reference_code"] == "HTL99421"
    assert scan_data["upload_id"] is not None

    # Confirm the draft by creating a ticket with upload_id
    confirm_res = await async_client.post(
        f"/api/v1/trips/{trip_id}/tickets",
        json={
            "ticket_type": draft["ticket_type"],
            "title": draft["title"],
            "access_code": draft["access_code"],
            "reference_code": draft["reference_code"],
            "upload_id": scan_data["upload_id"],
        },
    )
    assert confirm_res.status_code == 201
    confirmed = confirm_res.json()
    assert len(confirmed["attachments"]) == 1
    assert confirmed["attachments"][0]["filename"] == "pasted_text.txt"
