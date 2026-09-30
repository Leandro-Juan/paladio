import uuid
import pytest
from httpx import AsyncClient


@pytest.mark.asyncio
async def test_trip_participants_and_expenses(async_client: AsyncClient):
    uid = uuid.uuid4().hex[:8]

    # Register User A (Alice)
    res_a = await async_client.post(
        "/api/v1/auth/register",
        json={
            "email": f"alice_{uid}@paladio.com",
            "username": f"alice_{uid}",
            "password": "passwordA123",
        },
    )
    assert res_a.status_code == 201, res_a.text
    token_a = res_a.json()["access_token"]
    headers_a = {"Authorization": f"Bearer {token_a}"}

    # Register User B (Bob)
    res_b = await async_client.post(
        "/api/v1/auth/register",
        json={
            "email": f"bob_{uid}@paladio.com",
            "username": f"bob_{uid}",
            "password": "passwordB123",
        },
    )
    assert res_b.status_code == 201
    user_b_id = res_b.json()["user"]["id"]

    # Check collaborator options endpoint
    collab_res = await async_client.get(
        "/api/v1/users/collaborators/options", headers=headers_a
    )
    assert collab_res.status_code == 200
    collab_list = collab_res.json()
    assert any(c["id"] == user_b_id for c in collab_list)

    # User A creates a trip
    create_trip_res = await async_client.post(
        "/api/v1/trips/",
        json={
            "destination": "Rome",
            "start_date": "2026-10-10",
            "end_date": "2026-10-15",
            "itinerary_data": {"days": []},
        },
        headers=headers_a,
    )
    assert create_trip_res.status_code == 201
    trip_data = create_trip_res.json()
    trip_id = trip_data["id"]
    assert len(trip_data["participants"]) == 1
    alice_p_id = trip_data["participants"][0]["id"]
    assert trip_data["participants"][0]["name"] == f"alice_{uid}"

    # Add Bob as participant
    add_bob_res = await async_client.post(
        f"/api/v1/trips/{trip_id}/participants",
        json={"name": f"bob_{uid}", "user_id": user_b_id, "role": "traveler"},
        headers=headers_a,
    )
    assert add_bob_res.status_code == 201
    bob_p_id = add_bob_res.json()["id"]

    # Add a guest participant (Charlie)
    add_charlie_res = await async_client.post(
        f"/api/v1/trips/{trip_id}/participants",
        json={"name": "Charlie", "role": "traveler"},
        headers=headers_a,
    )
    assert add_charlie_res.status_code == 201
    charlie_p_id = add_charlie_res.json()["id"]

    # Verify listing participants
    list_p_res = await async_client.get(
        f"/api/v1/trips/{trip_id}/participants", headers=headers_a
    )
    assert list_p_res.status_code == 200
    p_names = [p["name"] for p in list_p_res.json()]
    assert f"alice_{uid}" in p_names
    assert f"bob_{uid}" in p_names
    assert "Charlie" in p_names

    # Add an expense paid by Alice: €90 for dinner, split equally among all 3 (€30 each)
    exp_1_res = await async_client.post(
        f"/api/v1/trips/{trip_id}/expenses",
        json={
            "payer_id": alice_p_id,
            "description": "Dinner at Trastevere",
            "amount": 90.0,
            "category": "food",
            "split_type": "equal",
            "splits": [
                {"participant_id": alice_p_id, "amount": 30.0},
                {"participant_id": bob_p_id, "amount": 30.0},
                {"participant_id": charlie_p_id, "amount": 30.0},
            ],
        },
        headers=headers_a,
    )
    assert exp_1_res.status_code == 201
    exp_1_id = exp_1_res.json()["id"]

    # Add an expense paid by Bob: €30 for taxi, split between Bob and Charlie (€15 each)
    exp_2_res = await async_client.post(
        f"/api/v1/trips/{trip_id}/expenses",
        json={
            "payer_id": bob_p_id,
            "description": "Airport Taxi",
            "amount": 30.0,
            "category": "transport",
            "split_type": "custom",
            "splits": [
                {"participant_id": bob_p_id, "amount": 15.0},
                {"participant_id": charlie_p_id, "amount": 15.0},
            ],
        },
        headers=headers_a,
    )
    assert exp_2_res.status_code == 201

    # Verify listing expenses
    expenses_res = await async_client.get(
        f"/api/v1/trips/{trip_id}/expenses", headers=headers_a
    )
    assert expenses_res.status_code == 200
    assert len(expenses_res.json()) == 2

    # Check Tricount settlement calculation:
    # Alice: paid 90, share 30 -> net balance = +60
    # Bob: paid 30, share 30 + 15 = 45 -> net balance = -15
    # Charlie: paid 0, share 30 + 15 = 45 -> net balance = -45
    # Debt settlement transfers:
    # Charlie owes Alice €45
    # Bob owes Alice €15
    settlement_res = await async_client.get(
        f"/api/v1/trips/{trip_id}/settlement", headers=headers_a
    )
    assert settlement_res.status_code == 200
    s_data = settlement_res.json()
    assert s_data["total_expenses"] == 120.0

    bal_map = {b["participant_id"]: b for b in s_data["balances"]}
    assert bal_map[alice_p_id]["net_balance"] == 60.0
    assert bal_map[bob_p_id]["net_balance"] == -15.0
    assert bal_map[charlie_p_id]["net_balance"] == -45.0

    # Verify minimal transfers
    transfers = s_data["transfers"]
    assert len(transfers) == 2
    # Verify Charlie transfers to Alice 45 and Bob transfers to Alice 15
    transfer_tuples = [
        (t["sender_id"], t["receiver_id"], t["amount"]) for t in transfers
    ]
    assert (charlie_p_id, alice_p_id, 45.0) in transfer_tuples
    assert (bob_p_id, alice_p_id, 15.0) in transfer_tuples

    # Delete first expense and verify settlement updates
    del_exp_res = await async_client.delete(
        f"/api/v1/trips/{trip_id}/expenses/{exp_1_id}", headers=headers_a
    )
    assert del_exp_res.status_code == 200

    settlement_2 = (
        await async_client.get(f"/api/v1/trips/{trip_id}/settlement", headers=headers_a)
    ).json()
    assert settlement_2["total_expenses"] == 30.0
    bal_map_2 = {b["participant_id"]: b for b in settlement_2["balances"]}
    assert bal_map_2[alice_p_id]["net_balance"] == 0.0
    assert bal_map_2[bob_p_id]["net_balance"] == 15.0
    assert bal_map_2[charlie_p_id]["net_balance"] == -15.0
