from __future__ import annotations

import logging
from typing import List, Optional

from ..core.types import Segment, PipelineError

logger = logging.getLogger(__name__)

MIN_KEYWORDS = 5
MAX_KEYWORDS = 8


class KeywordsError(PipelineError):
    pass


def _load_kw_model():
    try:
        from keybert import KeyBERT
        return KeyBERT(model="all-MiniLM-L6-v2")
    except Exception as e:
        raise KeywordsError(f"Failed to load KeyBERT model: {e}")


class KeywordsService:
    """KeyBERT-based keyword extraction for podcast segments."""

    def __init__(self):
        self._model = None

    def _ensure_model(self):
        if self._model is None:
            self._model = _load_kw_model()

    def extract_keywords(self, text: str) -> List[str]:
        """Extract keywords from a single text using KeyBERT."""
        self._ensure_model()
        if not text.strip():
            return []

        candidates = self._model.extract_keywords(
            text,
            keyphrase_ngram_range=(1, 2),
            stop_words="english",
            top_n=MAX_KEYWORDS,
        )
        keywords = [kw for kw, _ in candidates]

        if len(keywords) < MIN_KEYWORDS:
            fallback = self._model.extract_keywords(
                text,
                keyphrase_ngram_range=(1, 1),
                stop_words="english",
                top_n=MIN_KEYWORDS,
            )
            for kw, _ in fallback:
                if kw not in keywords:
                    keywords.append(kw)
                if len(keywords) >= MIN_KEYWORDS:
                    break

        return keywords[:MAX_KEYWORDS]

    def extract_keywords_from_segments(self, segments: List[Segment]) -> List[Segment]:
        """Add keywords to each segment in-place and return them."""
        self._ensure_model()
        for seg in segments:
            seg.keywords = self.extract_keywords(seg.text)
        logger.info("Extracted keywords for %d segments", len(segments))
        return segments
