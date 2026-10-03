import uuid
from datetime import datetime

from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload
from sqlalchemy.orm.attributes import set_committed_value

from app.models.todo import Todo
from app.models.todo_tag import TodoTag
from app.schemas.todo import TodoCreate


async def create_todo(
    db: AsyncSession, todo_data: TodoCreate, user_id: uuid.UUID
) -> Todo:
    todo = Todo(
        title=todo_data.title,
        description=todo_data.description,
        user_id=user_id,
    )
    db.add(todo)
    await db.flush()
    await db.refresh(todo)
    set_committed_value(todo, "tags", [])
    return todo


def _todo_filters(
    user_id: uuid.UUID,
    status: str | None = None,
    tag_id: uuid.UUID | None = None,
    keyword: str | None = None,
    date_from: datetime | None = None,
    date_to: datetime | None = None,
):
    filters = [Todo.user_id == user_id]

    if status == "completed":
        filters.append(Todo.completed.is_(True))
    elif status in ("active", "pending"):
        filters.append(Todo.completed.is_(False))

    if keyword and keyword.strip():
        like = f"%{keyword.strip()}%"
        filters.append(
            or_(Todo.title.ilike(like), Todo.description.ilike(like))
        )

    if tag_id:
        filters.append(
            Todo.id.in_(select(TodoTag.todo_id).where(TodoTag.tag_id == tag_id))
        )

    if date_from:
        filters.append(Todo.created_at >= date_from)
    if date_to:
        filters.append(Todo.created_at <= date_to)

    return filters


async def get_todos(
    db: AsyncSession,
    user_id: uuid.UUID,
    skip: int = 0,
    limit: int = 20,
    status: str | None = None,
    tag_id: uuid.UUID | None = None,
    keyword: str | None = None,
    date_from: datetime | None = None,
    date_to: datetime | None = None,
) -> tuple[list[Todo], int]:
    """Get todos with filtering, pagination, newest first."""
    filters = _todo_filters(
        user_id,
        status=status,
        tag_id=tag_id,
        keyword=keyword,
        date_from=date_from,
        date_to=date_to,
    )

    query = (
        select(Todo)
        .options(selectinload(Todo.tags))
        .where(*filters)
        .order_by(Todo.created_at.desc(), Todo.id.desc())
        .offset(skip)
        .limit(limit)
    )
    result = await db.execute(query)
    todos = list(result.scalars().all())

    count_query = select(func.count()).select_from(Todo).where(*filters)
    total = await db.execute(count_query)

    return todos, total.scalar_one()


async def get_todo_by_id(db: AsyncSession, todo_id: uuid.UUID) -> Todo | None:
    result = await db.execute(
        select(Todo)
        .options(selectinload(Todo.tags))
        .where(Todo.id == todo_id)
    )
    return result.scalar_one_or_none()


async def update_todo(db: AsyncSession, todo: Todo, update_data: dict) -> Todo:
    for key, value in update_data.items():
        setattr(todo, key, value)
    await db.flush()
    await db.refresh(todo, attribute_names=["tags"])
    return todo


async def delete_todo(db: AsyncSession, todo: Todo) -> None:
    await db.delete(todo)
    await db.flush()


async def bulk_update_status(
    db: AsyncSession,
    user_id: uuid.UUID,
    todo_ids: list[uuid.UUID],
    completed: bool,
) -> int:
    """Update completed status for multiple todos belonging to the user.

    Runs in the caller's transaction. Returns number of rows updated.
    """
    result = await db.execute(
        select(Todo).where(
            Todo.user_id == user_id,
            Todo.id.in_(todo_ids),
        )
    )
    todos = list(result.scalars().all())
    for todo in todos:
        todo.completed = completed
    await db.flush()
    return len(todos)
