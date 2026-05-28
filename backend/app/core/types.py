from __future__ import annotations

from dataclasses import dataclass, field
from enum import Enum
from typing import Any, Dict, List, Optional


class PipelineStage(str, Enum):
    QUEUED = "queued"
    PREPROCESS = "preprocess"
    TRANSCRIBE = "transcribe"
    TUNE = "tune"
    SEGMENT = "segment"
    KEYWORDS = "keywords"
    SUMMARIZE = "summarize"
    SENTIMENT = "sentiment"
    ENRICH = "enrich"
    COMPLETED = "completed"
    FAILED = "failed"


STAGE_WEIGHTS: Dict[PipelineStage, float] = {
    PipelineStage.PREPROCESS: 0.10,
    PipelineStage.TRANSCRIBE: 0.45,
    PipelineStage.TUNE: 0.10,
    PipelineStage.SEGMENT: 0.10,
    PipelineStage.KEYWORDS: 0.05,
    PipelineStage.SUMMARIZE: 0.10,
    PipelineStage.SENTIMENT: 0.05,
    PipelineStage.ENRICH: 0.05,
}

STAGE_ORDER: List[PipelineStage] = [
    PipelineStage.PREPROCESS,
    PipelineStage.TRANSCRIBE,
    PipelineStage.TUNE,
    PipelineStage.SEGMENT,
    PipelineStage.KEYWORDS,
    PipelineStage.SUMMARIZE,
    PipelineStage.SENTIMENT,
    PipelineStage.ENRICH,
]


@dataclass
class TranscriptionChunk:
    text: str
    start: float
    end: float
    confidence: float = 0.0
    speaker: Optional[str] = None


@dataclass
class Segment:
    segment_id: int
    start_time: float
    end_time: float
    text: str
    topic: str = ""
    summary: str = ""
    keywords: List[str] = field(default_factory=list)
    sentiment_score: float = 0.0
    embedding: Optional[List[float]] = None


@dataclass
class PipelineResult:
    episode_id: str
    duration: float
    segments: List[Segment]
    block_size: int = 5
    k: float = 1.0


class PipelineError(Exception):
    pass


class TranscriptionError(PipelineError):
    pass


class SegmentationError(PipelineError):
    pass


class AudioExtractionError(PipelineError):
    pass
