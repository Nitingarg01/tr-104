from pydantic import BaseModel
from typing import Optional, List


class SegmentResponse(BaseModel):
    id: int
    episode_id: int
    start: float
    end: float
    text: str
    class Config:
        orm_mode = True
