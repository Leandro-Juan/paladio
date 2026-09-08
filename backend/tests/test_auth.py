import pytest
from httpx import AsyncClient


@pytest.mark.asyncio
async def test_register_user(async_client: AsyncClient):
    payload = {
        "email": "traveler@paladio.com",
        "username": "traveler1",
        "password": "strongpassword123",
        "preferences": {"pace": "fast", "budget": "medium"},
    }
    response = await async_client.post("/api/v1/auth/register", json=payload)
    assert response.status_code == 201, response.text

    data = response.json()
    assert "access_token" in data
    assert data["token_type"] == "bearer"
    assert data["user"]["email"] == "traveler@paladio.com"
    assert data["user"]["username"] == "traveler1"
    assert data["user"]["has_embedding"] is True
    assert data["user"]["preferences"] == {"pace": "fast", "budget": "medium"}


@pytest.mark.asyncio
async def test_register_duplicate_user(async_client: AsyncClient):
    payload = {
        "email": "duplicate@paladio.com",
        "username": "duplicate_user",
        "password": "strongpassword123",
    }
    res1 = await async_client.post("/api/v1/auth/register", json=payload)
    assert res1.status_code == 201

    # Duplicate email
    res2 = await async_client.post(
        "/api/v1/auth/register",
        json={
            "email": "duplicate@paladio.com",
            "username": "other_username",
            "password": "password456",
        },
    )
    assert res2.status_code == 400
    assert "email already exists" in res2.text

    # Duplicate username
    res3 = await async_client.post(
        "/api/v1/auth/register",
        json={
            "email": "other@paladio.com",
            "username": "duplicate_user",
            "password": "password456",
        },
    )
    assert res3.status_code == 400
    assert "username already exists" in res3.text


@pytest.mark.asyncio
async def test_login_user(async_client: AsyncClient):
    register_payload = {
        "email": "login_test@paladio.com",
        "username": "logintest",
        "password": "loginpassword123",
    }
    await async_client.post("/api/v1/auth/register", json=register_payload)

    # Login with username
    login_user_res = await async_client.post(
        "/api/v1/auth/login",
        json={"username_or_email": "logintest", "password": "loginpassword123"},
    )
    assert login_user_res.status_code == 200
    assert "access_token" in login_user_res.json()

    # Login with email
    login_email_res = await async_client.post(
        "/api/v1/auth/login",
        json={
            "username_or_email": "login_test@paladio.com",
            "password": "loginpassword123",
        },
    )
    assert login_email_res.status_code == 200
    assert "access_token" in login_email_res.json()

    # Login with invalid password
    bad_res = await async_client.post(
        "/api/v1/auth/login",
        json={"username_or_email": "logintest", "password": "wrong_password"},
    )
    assert bad_res.status_code == 401


@pytest.mark.asyncio
async def test_get_current_user_me(async_client: AsyncClient):
    register_payload = {
        "email": "me_test@paladio.com",
        "username": "metest",
        "password": "mepassword123",
    }
    reg_res = await async_client.post("/api/v1/auth/register", json=register_payload)
    token = reg_res.json()["access_token"]

    # Valid token
    me_res = await async_client.get(
        "/api/v1/auth/me",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert me_res.status_code == 200
    data = me_res.json()
    assert data["username"] == "metest"
    assert data["email"] == "me_test@paladio.com"

    # Missing token
    unauth_res = await async_client.get("/api/v1/auth/me")
    assert unauth_res.status_code == 401

    # Invalid token
    bad_token_res = await async_client.get(
        "/api/v1/auth/me",
        headers={"Authorization": "Bearer invalid.jwt.token"},
    )
    assert bad_token_res.status_code == 401
