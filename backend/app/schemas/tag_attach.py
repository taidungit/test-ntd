import uuid

from pydantic import BaseModel


class AttachTagRequest(BaseModel):
    tag_id: uuid.UUID