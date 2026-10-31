import uuid
import pytest
from httpx import AsyncClient


@pytest.mark.asyncio
async def test_register_user(async_client: AsyncClient):
    uid = uuid.uuid4().hex[:8]
    payload = {
        "email": f"traveler_{uid}@paladio.com",
        "username": f"traveler_{uid}",
        "password": "strongpassword123",
        "preferences": {"pace": "fast", "budget": "medium"},
    }
    response = await async_client.post("/api/auth/register", json=payload)
    assert response.status_code == 201, response.text

    data = response.json()
    assert "access_token" in data
    assert data["token_type"] == "bearer"
    assert data["user"]["email"] == payload["email"]
    assert data["user"]["username"] == payload["username"]
    assert data["user"]["has_embedding"] is True
    assert data["user"]["preferences"] == {"pace": "fast", "budget": "medium"}


@pytest.mark.asyncio
async def test_register_duplicate_user(async_client: AsyncClient):
    uid = uuid.uuid4().hex[:8]
    payload = {
        "email": f"dup_{uid}@paladio.com",
        "username": f"dup_{uid}",
        "password": "strongpassword123",
    }
    res1 = await async_client.post("/api/auth/register", json=payload)
    assert res1.status_code == 201

    # Duplicate email
    res2 = await async_client.post(
        "/api/auth/register",
        json={
            "email": payload["email"],
            "username": f"other_{uid}",
            "password": "password456",
        },
    )
    assert res2.status_code == 400
    assert "email already exists" in res2.text

    # Duplicate username
    res3 = await async_client.post(
        "/api/auth/register",
        json={
            "email": f"other_{uid}@paladio.com",
            "username": payload["username"],
            "password": "password456",
        },
    )
    assert res3.status_code == 400
    assert "username already exists" in res3.text


@pytest.mark.asyncio
async def test_login_user(async_client: AsyncClient):
    uid = uuid.uuid4().hex[:8]
    register_payload = {
        "email": f"login_{uid}@paladio.com",
        "username": f"login_{uid}",
        "password": "loginpassword123",
    }
    await async_client.post("/api/auth/register", json=register_payload)

    # Login with username
    login_user_res = await async_client.post(
        "/api/auth/login",
        json={
            "username_or_email": register_payload["username"],
            "password": "loginpassword123",
        },
    )
    assert login_user_res.status_code == 200
    assert "access_token" in login_user_res.json()

    # Login with email
    login_email_res = await async_client.post(
        "/api/auth/login",
        json={
            "username_or_email": register_payload["email"],
            "password": "loginpassword123",
        },
    )
    assert login_email_res.status_code == 200
    assert "access_token" in login_email_res.json()

    # Login with invalid password
    bad_res = await async_client.post(
        "/api/auth/login",
        json={
            "username_or_email": register_payload["username"],
            "password": "wrong_password",
        },
    )
    assert bad_res.status_code == 401


@pytest.mark.asyncio
async def test_get_current_user_me(async_client: AsyncClient):
    uid = uuid.uuid4().hex[:8]
    register_payload = {
        "email": f"me_{uid}@paladio.com",
        "username": f"me_{uid}",
        "password": "mepassword123",
    }
    reg_res = await async_client.post("/api/auth/register", json=register_payload)
    token = reg_res.json()["access_token"]

    # Valid token
    me_res = await async_client.get(
        "/api/users/me",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert me_res.status_code == 200
    data = me_res.json()
    assert data["username"] == register_payload["username"]
    assert data["email"] == register_payload["email"]

    # Missing token
    unauth_res = await async_client.get("/api/users/me")
    assert unauth_res.status_code == 401

    # Invalid token
    bad_token_res = await async_client.get(
        "/api/users/me",
        headers={"Authorization": "Bearer invalid.jwt.token"},
    )
    assert bad_token_res.status_code == 401
