import uuid
from datetime import datetime

from pydantic import BaseModel, Field


class TagCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=50)
    color: str | None = Field(None, max_length=20)


class TagUpdate(BaseModel):
    name: str | None = Field(None, min_length=1, max_length=50)
    color: str | None = Field(None, max_length=20)


class TagResponse(BaseModel):
    id: uuid.UUID
    name: str
    color: str | None
    user_id: uuid.UUID
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class TagBrief(BaseModel):
    """Lightweight tag for embedding in TodoResponse."""

    id: uuid.UUID
    name: str
    color: str | None

    model_config = {"from_attributes": True}