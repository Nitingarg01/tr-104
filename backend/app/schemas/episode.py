from pydantic import BaseModel
from typing import Optional


class EpisodeCreate(BaseModel):
    title: str
    description: Optional[str] = None
    duration_seconds: Optional[int] = None


class EpisodeResponse(BaseModel):
    id: int
    title: str
    description: Optional[str] = None
    duration_seconds: Optional[int] = None
    class Config:
        orm_mode = True
