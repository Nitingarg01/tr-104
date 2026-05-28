from pydantic import BaseModel
from typing import List, Optional


class SearchRequest(BaseModel):
    query: str
    limit: Optional[int] = 10
    episode_id: Optional[str] = None  # if set, restrict search to this episode


class SearchResult(BaseModel):
    episode_id: str
    segment_id: int
    score: float
    start_time: float
    end_time: float
    text: str
    summary: Optional[str] = None
    keywords: Optional[List[str]] = None


class SearchResponse(BaseModel):
    results: List[SearchResult]


class AskRequest(BaseModel):
    question: str
    episodes: Optional[List[str]] = None
    top_k: int = 5


class Citation(BaseModel):
    episode_id: str
    segment_id: int
    start_time: float
    end_time: float
    text: str
    relevance_score: float


class AskResponse(BaseModel):
    answer: str
    citations: List[Citation]
