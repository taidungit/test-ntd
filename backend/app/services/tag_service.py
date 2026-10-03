import uuid

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm.attributes import set_committed_value

from app.models.tag import Tag
from app.models.todo import Todo
from app.models.todo_tag import TodoTag
from app.schemas.tag import TagCreate, TagUpdate


async def get_tags_by_user(db: AsyncSession, user_id: uuid.UUID) -> list[Tag]:
    result = await db.execute(
        select(Tag)
        .where(Tag.user_id == user_id)
        .order_by(Tag.name.asc())
    )
    return list(result.scalars().all())


async def get_tag_by_id(db: AsyncSession, tag_id: uuid.UUID) -> Tag | None:
    result = await db.execute(select(Tag).where(Tag.id == tag_id))
    return result.scalar_one_or_none()


async def get_tag_by_name_ci(
    db: AsyncSession, user_id: uuid.UUID, name: str
) -> Tag | None:
    """Case-insensitive lookup of a tag name for a user."""
    result = await db.execute(
        select(Tag).where(
            Tag.user_id == user_id,
            func.lower(Tag.name) == name.lower(),
        )
    )
    return result.scalar_one_or_none()


async def create_tag(
    db: AsyncSession, data: TagCreate, user_id: uuid.UUID
) -> Tag:
    existing = await get_tag_by_name_ci(db, user_id, data.name)
    if existing:
        raise ValueError("Tag name already exists for this user")

    tag = Tag(
        name=data.name.strip(),
        color=data.color,
        user_id=user_id,
    )
    db.add(tag)
    await db.flush()
    await db.refresh(tag)
    set_committed_value(tag, "todos", [])
    return tag


async def update_tag(db: AsyncSession, tag: Tag, data: TagUpdate) -> Tag:
    update_data = data.model_dump(exclude_unset=True)

    if "name" in update_data and update_data["name"] is not None:
        new_name = update_data["name"].strip()
        existing = await get_tag_by_name_ci(db, tag.user_id, new_name)
        if existing and existing.id != tag.id:
            raise ValueError("Tag name already exists for this user")
        tag.name = new_name

    if "color" in update_data:
        tag.color = update_data["color"]

    await db.flush()
    await db.refresh(tag)
    return tag


async def delete_tag(db: AsyncSession, tag: Tag) -> None:
    await db.delete(tag)
    await db.flush()


async def attach_tag_to_todo(
    db: AsyncSession,
    todo: Todo,
    tag: Tag,
) -> None:
    if todo.user_id != tag.user_id:
        raise PermissionError("Cannot attach another user's tag")

    existing = await db.execute(
        select(TodoTag).where(
            TodoTag.todo_id == todo.id,
            TodoTag.tag_id == tag.id,
        )
    )
    if existing.scalar_one_or_none():
        return  # already attached – idempotent

    db.add(TodoTag(todo_id=todo.id, tag_id=tag.id))
    await db.flush()


async def detach_tag_from_todo(
    db: AsyncSession,
    todo_id: uuid.UUID,
    tag_id: uuid.UUID,
) -> bool:
    result = await db.execute(
        select(TodoTag).where(
            TodoTag.todo_id == todo_id,
            TodoTag.tag_id == tag_id,
        )
    )
    link = result.scalar_one_or_none()
    if not link:
        return False
    await db.delete(link)
    await db.flush()
    return True