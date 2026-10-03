"""Critical todo authorization, persistence, and cache-invalidation tests."""

import json

import pytest
from httpx import AsyncClient

from tests.conftest import InMemoryRedis


async def auth_headers(client: AsyncClient, email: str) -> tuple[dict, str]:
    response = await client.post(
        "/api/v1/auth/register",
        json={"email": email, "password": "password123"},
    )
    assert response.status_code == 201
    token = response.json()["access_token"]
    me = await client.get(
        "/api/v1/auth/me",
        headers={"Authorization": f"Bearer {token}"},
    )
    return {"Authorization": f"Bearer {token}"}, me.json()["id"]


async def create_todo(client: AsyncClient, headers: dict, **payload) -> dict:
    response = await client.post("/api/v1/todos", json=payload, headers=headers)
    assert response.status_code == 201
    return response.json()


@pytest.mark.asyncio
async def test_user_cannot_read_update_or_delete_another_users_todo(
    client: AsyncClient,
):
    headers_a, _ = await auth_headers(client, "owner-a@example.com")
    headers_b, _ = await auth_headers(client, "intruder-b@example.com")

    todo = await create_todo(
        client,
        headers_a,
        title="Private A todo",
        description="must stay isolated",
    )
    todo_id = todo["id"]

    get_response = await client.get(f"/api/v1/todos/{todo_id}", headers=headers_b)
    assert get_response.status_code == 403

    update_response = await client.put(
        f"/api/v1/todos/{todo_id}",
        json={"title": "Hijacked"},
        headers=headers_b,
    )
    assert update_response.status_code == 403

    delete_response = await client.delete(
        f"/api/v1/todos/{todo_id}",
        headers=headers_b,
    )
    assert delete_response.status_code == 403

    still_owned = await client.get(f"/api/v1/todos/{todo_id}", headers=headers_a)
    assert still_owned.status_code == 200
    assert still_owned.json()["title"] == "Private A todo"

    list_b = await client.get("/api/v1/todos", headers=headers_b)
    assert list_b.status_code == 200
    assert all(item["id"] != todo_id for item in list_b.json()["items"])


@pytest.mark.asyncio
async def test_completed_toggle_from_true_back_to_false_persists(client: AsyncClient):
    headers, _ = await auth_headers(client, "toggle@example.com")
    todo = await create_todo(client, headers, title="Toggle me")
    todo_id = todo["id"]
    assert todo["completed"] is False

    completed = await client.put(
        f"/api/v1/todos/{todo_id}",
        json={"completed": True},
        headers=headers,
    )
    assert completed.status_code == 200
    assert completed.json()["completed"] is True

    reopened = await client.put(
        f"/api/v1/todos/{todo_id}",
        json={"completed": False},
        headers=headers,
    )
    assert reopened.status_code == 200
    assert reopened.json()["completed"] is False

    fetched = await client.get(f"/api/v1/todos/{todo_id}", headers=headers)
    assert fetched.status_code == 200
    assert fetched.json()["completed"] is False


@pytest.mark.asyncio
async def test_partial_title_update_does_not_erase_description(client: AsyncClient):
    headers, _ = await auth_headers(client, "partial@example.com")
    todo = await create_todo(
        client,
        headers,
        title="Original title",
        description="Keep this description",
    )
    todo_id = todo["id"]

    updated = await client.put(
        f"/api/v1/todos/{todo_id}",
        json={"title": "New title only"},
        headers=headers,
    )
    assert updated.status_code == 200
    body = updated.json()
    assert body["title"] == "New title only"
    assert body["description"] == "Keep this description"
    assert body["completed"] is False

    fetched = await client.get(f"/api/v1/todos/{todo_id}", headers=headers)
    assert fetched.json()["description"] == "Keep this description"


@pytest.mark.asyncio
async def test_create_update_delete_invalidate_todo_list_cache(
    client: AsyncClient,
    redis_store: InMemoryRedis,
):
    headers, user_id = await auth_headers(client, "cache@example.com")
    cache_key = f"todos:list:{user_id}:1:20"

    await create_todo(client, headers, title="Cached todo", description="stale risk")

    listed = await client.get("/api/v1/todos", headers=headers)
    assert listed.status_code == 200
    assert cache_key in redis_store.store
    cached = json.loads(redis_store.store[cache_key])
    assert cached["total"] == 1

    created = await create_todo(client, headers, title="After cache")
    assert cache_key not in redis_store.store

    listed_after_create = await client.get("/api/v1/todos", headers=headers)
    titles = {item["title"] for item in listed_after_create.json()["items"]}
    assert "After cache" in titles
    assert listed_after_create.json()["total"] == 2

    todo_id = created["id"]
    updated = await client.put(
        f"/api/v1/todos/{todo_id}",
        json={"title": "Updated after cache"},
        headers=headers,
    )
    assert updated.status_code == 200
    assert cache_key not in redis_store.store

    listed_after_update = await client.get("/api/v1/todos", headers=headers)
    titles = {item["title"] for item in listed_after_update.json()["items"]}
    assert "Updated after cache" in titles
    assert "After cache" not in titles

    deleted = await client.delete(f"/api/v1/todos/{todo_id}", headers=headers)
    assert deleted.status_code == 204
    assert cache_key not in redis_store.store

    listed_after_delete = await client.get("/api/v1/todos", headers=headers)
    ids = {item["id"] for item in listed_after_delete.json()["items"]}
    assert todo_id not in ids
    assert listed_after_delete.json()["total"] == 1
