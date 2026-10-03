import json
import uuid

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user, get_redis
from app.core.redis import RedisClient
from app.db.session import get_db
from app.models.user import User
from app.schemas.todo import TodoCreate, TodoListResponse, TodoResponse, TodoUpdate
from app.services.todo_service import (
    create_todo,
    delete_todo,
    get_todo_by_id,
    get_todos,
    update_todo,
)

from datetime import datetime
from app.schemas.tag import TagBrief
from app.schemas.tag_attach import AttachTagRequest
from app.schemas.todo import BulkStatusResponse, BulkStatusUpdate
from app.services.tag_service import (
    attach_tag_to_todo,
    detach_tag_from_todo,
    get_tag_by_id,
)
from app.services.todo_service import bulk_update_status

router = APIRouter()

CACHE_TTL = 300  # 5 minutes

def todos_list_cache_key(
    user_id: uuid.UUID,
    page: int,
    size: int,
    status_filter: str | None = None,
    tag_id: uuid.UUID | None = None,
    keyword: str | None = None,
    date_from: datetime | None = None,
    date_to: datetime | None = None,
) -> str:
    return ":".join(
        [
            "todos:list",
            str(user_id),
            str(page),
            str(size),
            status_filter or "",
            str(tag_id) if tag_id else "",
            keyword or "",
            date_from.isoformat() if date_from else "",
            date_to.isoformat() if date_to else "",
        ]
    )


async def invalidate_todo_list_cache(
    redis: RedisClient, user_id: uuid.UUID
) -> None:
    await redis.delete_by_pattern(f"todos:list:{user_id}:*")
    # Legacy global key from earlier versions
    await redis.delete("todos:list")

def ensure_todo_owner(todo, current_user: User) -> None:
    if todo.user_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Not allowed to access this todo",
        )
        

@router.get("", response_model=TodoListResponse)
async def list_todos(
    page: int = Query(1, ge=1),
    size: int = Query(20, ge=1),
    status_filter: str | None = Query(None, alias="status"),
    tag_id: uuid.UUID | None = Query(None),
    keyword: str | None = Query(None),
    date_from: datetime | None = Query(None),
    date_to: datetime | None = Query(None),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    redis: RedisClient = Depends(get_redis),
):
    """Get paginated list of todos."""
    skip = (page - 1) * size

    cache_key = todos_list_cache_key(
        current_user.id,
        page,
        size,
        status_filter=status_filter,
        tag_id=tag_id,
        keyword=keyword,
        date_from=date_from,
        date_to=date_to,
    )

    # Try to get from cache
    cached = await redis.get(cache_key)
    if cached:
        cached_data = json.loads(cached)
        return TodoListResponse(**cached_data)

    todos, total = await get_todos(db, user_id=current_user.id, skip=skip, limit=size,
        status=status_filter,
        tag_id=tag_id,
        keyword=keyword,
        date_from=date_from,
        date_to=date_to)

    items = []
    for todo in todos:
        user_result = await db.execute(select(User).where(User.id == todo.user_id))
        user = user_result.scalar_one_or_none()
        items.append(
            TodoResponse(
                id=todo.id,
                title=todo.title,
                description=todo.description,
                completed=todo.completed,
                user_id=todo.user_id,
                created_at=todo.created_at,
                updated_at=todo.updated_at,
                user_email=user.email if user else None,
                tags=[TagBrief.model_validate(t) for t in (todo.tags or [])],
            )
        )

    response = TodoListResponse(
        items=items,
        total=total,
        page=page,
        size=size,
    )

    # Cache the response
    await redis.set(cache_key, response.model_dump_json(), ex=CACHE_TTL)

    return response


@router.patch("/bulk-status", response_model=BulkStatusResponse)
async def bulk_status(
    payload: BulkStatusUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    redis: RedisClient = Depends(get_redis),
):
    count = await bulk_update_status(
        db,
        user_id=current_user.id,
        todo_ids=payload.todo_ids,
        completed=payload.completed,
    )
    await invalidate_todo_list_cache(redis, current_user.id)
    return BulkStatusResponse(updated_count=count)


@router.post("", response_model=TodoResponse, status_code=status.HTTP_201_CREATED)
async def create_new_todo(
    todo_data: TodoCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    redis: RedisClient = Depends(get_redis),
):
    """Create a new todo item."""
    todo = await create_todo(db, todo_data, current_user.id)
    await invalidate_todo_list_cache(redis, current_user.id)
    return todo


@router.get("/{todo_id}", response_model=TodoResponse)
async def get_todo(
    todo_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Get a specific todo by ID."""
    todo = await get_todo_by_id(db, todo_id)
    if not todo:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Todo not found",
        )
    ensure_todo_owner(todo, current_user)
    return todo


@router.put("/{todo_id}", response_model=TodoResponse)
async def update_existing_todo(
    todo_id: uuid.UUID,
    todo_data: TodoUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    redis: RedisClient = Depends(get_redis),
):
    """Update a todo item."""
    todo = await get_todo_by_id(db, todo_id)
    if not todo:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Todo not found",
        )

    ensure_todo_owner(todo, current_user)

    update_data = todo_data.model_dump(exclude_unset=True)


    if "completed" in update_data:
        todo.completed = update_data["completed"]
    if "title" in update_data:
        todo.title = update_data["title"]
    if "description" in update_data:
        todo.description = update_data["description"]

    updated_todo = await update_todo(db, todo, {})
    await invalidate_todo_list_cache(redis, current_user.id)
    return updated_todo


@router.delete("/{todo_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_existing_todo(
    todo_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    redis: RedisClient = Depends(get_redis),
):
    """Delete a todo item."""
    todo = await get_todo_by_id(db, todo_id)
    if not todo:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Todo not found",
        )
    ensure_todo_owner(todo, current_user)
    await delete_todo(db, todo)
    await invalidate_todo_list_cache(redis, current_user.id)
    return None


@router.post("/{todo_id}/tags", response_model=TodoResponse)
async def attach_tag(
    todo_id: uuid.UUID,
    body: AttachTagRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    redis: RedisClient = Depends(get_redis),
):
    todo = await get_todo_by_id(db, todo_id)
    if not todo:
        raise HTTPException(status_code=404, detail="Todo not found")
    ensure_todo_owner(todo, current_user)

    tag = await get_tag_by_id(db, body.tag_id)
    if not tag:
        raise HTTPException(status_code=404, detail="Tag not found")
    if tag.user_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not allowed to use this tag")

    await attach_tag_to_todo(db, todo, tag)
    todo = await get_todo_by_id(db, todo_id)
    await invalidate_todo_list_cache(redis, current_user.id)
    return todo


@router.delete("/{todo_id}/tags/{tag_id}", response_model=TodoResponse)
async def detach_tag(
    todo_id: uuid.UUID,
    tag_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    redis: RedisClient = Depends(get_redis),
):
    todo = await get_todo_by_id(db, todo_id)
    if not todo:
        raise HTTPException(status_code=404, detail="Todo not found")
    ensure_todo_owner(todo, current_user)

    removed = await detach_tag_from_todo(db, todo_id, tag_id)
    if not removed:
        raise HTTPException(status_code=404, detail="Tag is not attached to this todo")

    todo = await get_todo_by_id(db, todo_id)
    await invalidate_todo_list_cache(redis, current_user.id)
    return todo