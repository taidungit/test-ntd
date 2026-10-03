"""JWT access-token rejection (expired / tampered)."""

from datetime import timedelta

import pytest
from httpx import AsyncClient
from jose import jwt

from app.core.config import settings
from app.core.security import create_access_token


async def register_user(client: AsyncClient, email: str) -> dict:
    response = await client.post(
        "/api/v1/auth/register",
        json={"email": email, "password": "password123"},
    )
    assert response.status_code == 201
    return response.json()


async def current_user_id(client: AsyncClient, access_token: str) -> str:
    response = await client.get(
        "/api/v1/auth/me",
        headers={"Authorization": f"Bearer {access_token}"},
    )
    assert response.status_code == 200
    return response.json()["id"]


@pytest.mark.asyncio
async def test_expired_access_token_is_rejected(client: AsyncClient):
    tokens = await register_user(client, "expired-jwt@example.com")
    user_id = await current_user_id(client, tokens["access_token"])

    expired = create_access_token(
        data={"sub": user_id},
        expires_delta=timedelta(minutes=-5),
    )
    response = await client.get(
        "/api/v1/todos",
        headers={"Authorization": f"Bearer {expired}"},
    )

    assert response.status_code == 401
    assert response.json()["detail"] == "Invalid authentication token"


@pytest.mark.asyncio
async def test_tampered_access_token_is_rejected(client: AsyncClient):
    tokens = await register_user(client, "tampered-jwt@example.com")
    valid = tokens["access_token"]
    payload = jwt.get_unverified_claims(valid)
    payload["sub"] = "00000000-0000-0000-0000-000000000099"
    tampered = jwt.encode(payload, "wrong-secret", algorithm=settings.JWT_ALGORITHM)

    response = await client.get(
        "/api/v1/todos",
        headers={"Authorization": f"Bearer {tampered}"},
    )

    assert response.status_code == 401
    assert response.json()["detail"] == "Invalid authentication token"


@pytest.mark.asyncio
async def test_malformed_access_token_is_rejected(client: AsyncClient):
    response = await client.get(
        "/api/v1/todos",
        headers={"Authorization": "Bearer not-a-jwt"},
    )

    assert response.status_code == 401
    assert response.json()["detail"] == "Invalid authentication token"
