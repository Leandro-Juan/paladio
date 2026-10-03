import os

import pytest
from httpx import AsyncClient


@pytest.mark.asyncio
async def test_user_admin_bootstrap_and_management(
    async_client: AsyncClient, db_session
):
    from sqlalchemy import delete
    from app.db.models import UserModel

    await db_session.execute(delete(UserModel))
    await db_session.commit()

    # 1. Check initial setup-status
    status_res = await async_client.get("/api/v1/auth/setup-status")
    assert status_res.status_code == 200
    assert status_res.json()["setup_required"] is True

    # 2. Perform Master Admin setup
    setup_payload = {
        "email": "masteradmin@paladio.internal",
        "username": "masteradmin",
        "password": "MasterAdminSecret123!",
    }
    setup_res = await async_client.post("/api/v1/auth/setup", json=setup_payload)
    assert setup_res.status_code == 201, setup_res.text
    admin_token = setup_res.json()["access_token"]
    admin_user = setup_res.json()["user"]
    assert admin_user["role"] == "admin"
    assert admin_user["username"] == "masteradmin"
    admin_headers = {"Authorization": f"Bearer {admin_token}"}

    # 3. Subsequent /setup attempt must be rejected
    second_setup = await async_client.post("/api/v1/auth/setup", json=setup_payload)
    assert second_setup.status_code == 400
    assert "already initialized" in second_setup.json()["detail"]

    # 4. Status should now report setup_required == False
    status_res2 = await async_client.get("/api/v1/auth/setup-status")
    assert status_res2.status_code == 200
    assert status_res2.json()["setup_required"] is False
    assert status_res2.json()["user_count"] == 1

    # 5. Public registration lockdown check (when ALLOW_PUBLIC_REGISTRATION=false)
    os.environ["ALLOW_PUBLIC_REGISTRATION"] = "false"
    reg_attempt = await async_client.post(
        "/api/v1/auth/register",
        json={
            "email": "random@paladio.internal",
            "username": "randomguy",
            "password": "Password123!",
        },
    )
    assert reg_attempt.status_code == 403
    assert "Public registration is disabled" in reg_attempt.json()["detail"]
    os.environ["ALLOW_PUBLIC_REGISTRATION"] = "true"  # restore

    # 6. Admin lists users
    list_res = await async_client.get("/api/v1/users/", headers=admin_headers)
    assert list_res.status_code == 200
    users = list_res.json()
    assert len(users) == 1
    assert users[0]["username"] == "masteradmin"
    assert users[0]["role"] == "admin"

    # 7. Admin provisions a standard user
    create_payload = {
        "email": "traveler1@paladio.internal",
        "username": "traveler1",
        "password": "TravelerSecret123!",
        "role": "user",
    }
    create_res = await async_client.post(
        "/api/v1/users/", json=create_payload, headers=admin_headers
    )
    assert create_res.status_code == 201, create_res.text
    traveler = create_res.json()
    assert traveler["username"] == "traveler1"
    assert traveler["role"] == "user"
    traveler_id = traveler["id"]

    # 8. Standard user logs in and verifies non-admin cannot access /api/v1/users/
    login_res = await async_client.post(
        "/api/v1/auth/login",
        json={
            "username_or_email": "traveler1",
            "password": "TravelerSecret123!",
        },
    )
    assert login_res.status_code == 200
    traveler_token = login_res.json()["access_token"]
    traveler_headers = {"Authorization": f"Bearer {traveler_token}"}

    forbidden_list = await async_client.get("/api/v1/users/", headers=traveler_headers)
    assert forbidden_list.status_code == 403
    assert "Administrator privileges required" in forbidden_list.json()["detail"]

    # 9. Admin self-protection: cannot deactivate or delete self
    self_deactivate = await async_client.patch(
        f"/api/v1/users/{admin_user['id']}",
        json={"is_active": False},
        headers=admin_headers,
    )
    assert self_deactivate.status_code == 400

    self_delete = await async_client.delete(
        f"/api/v1/users/{admin_user['id']}",
        headers=admin_headers,
    )
    assert self_delete.status_code == 400

    # 10. Admin modifies traveler (e.g. deactivate)
    deactivate_res = await async_client.patch(
        f"/api/v1/users/{traveler_id}",
        json={"is_active": False},
        headers=admin_headers,
    )
    assert deactivate_res.status_code == 200
    assert deactivate_res.json()["is_active"] is False

    # Deactivated user cannot log in
    deactivated_login = await async_client.post(
        "/api/v1/auth/login",
        json={
            "username_or_email": "traveler1",
            "password": "TravelerSecret123!",
        },
    )
    assert deactivated_login.status_code == 403

    # 11. Admin provisions a user without email (optional email)
    no_email_user = await async_client.post(
        "/api/v1/users/",
        json={
            "username": "noemailguy",
            "password": "Password123!",
            "role": "user",
        },
        headers=admin_headers,
    )
    assert no_email_user.status_code == 201, no_email_user.text
    no_email_data = no_email_user.json()
    assert no_email_data["username"] == "noemailguy"
    assert no_email_data["email"] == ""
    no_email_id = no_email_data["id"]

    # 12. Modify profile with avatar_url, new name, and email
    update_res = await async_client.patch(
        f"/api/v1/users/{no_email_id}",
        json={
            "username": "updatedguy",
            "email": "updatedguy@paladio.internal",
            "avatar_url": "https://example.com/avatar.png",
        },
        headers=admin_headers,
    )
    assert update_res.status_code == 200, update_res.text
    updated_data = update_res.json()
    assert updated_data["username"] == "updatedguy"
    assert updated_data["email"] == "updatedguy@paladio.internal"
    assert updated_data["preferences"]["avatar_url"] == "https://example.com/avatar.png"

    # 13. Admin updates own profile via /me
    me_update = await async_client.patch(
        "/api/v1/users/me",
        json={
            "avatar_url": "https://example.com/admin.png",
        },
        headers=admin_headers,
    )
    assert me_update.status_code == 200, me_update.text
    assert (
        me_update.json()["preferences"]["avatar_url"] == "https://example.com/admin.png"
    )

    # 14. Admin deletes traveler and noemailguy
    await async_client.delete(f"/api/v1/users/{traveler_id}", headers=admin_headers)
    await async_client.delete(f"/api/v1/users/{no_email_id}", headers=admin_headers)

    # Verify user list only has admin again
    final_list = await async_client.get("/api/v1/users/", headers=admin_headers)
    assert len(final_list.json()) == 1
