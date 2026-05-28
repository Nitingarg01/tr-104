import logging
import os
import threading
from dataclasses import dataclass
from typing import Any, Dict, List, Optional

import numpy as np

logger = logging.getLogger(__name__)

# Lazy-loaded singleton for SentenceTransformer model
_MODEL = None
_MODEL_LOCK = threading.Lock()


def _get_model(model_name: str = "all-MiniLM-L6-v2"):
    """Return a cached SentenceTransformer model (loaded once)."""
    global _MODEL  # noqa: PLW0603
    if _MODEL is not None:
        return _MODEL
    with _MODEL_LOCK:
        if _MODEL is not None:
            return _MODEL
        from sentence_transformers import SentenceTransformer
        _MODEL = SentenceTransformer(model_name)
        logger.info("Loaded SentenceTransformer model: %s", model_name)
    return _MODEL


@dataclass
class Segment:
    segment_id: str
    start_time: float
    end_time: float
    text: str
    embedding: Optional[object] = None


@dataclass
class SearchResult:
    segment_id: str
    score: float
    text: str
    metadata: Dict[str, Any]


class SearchService:
    def __init__(self, index_path: str = "./data/faiss_index"):
        self.index_path = index_path
        self._segments_ordered: List[Segment] = []
        self._index = None
        self._dim = 384
        logger.info("Initialized SearchService with index_path=%s", index_path)

    def _encode(self, texts: List[str]) -> np.ndarray:
        model = _get_model()
        return model.encode(texts, normalize_embeddings=True, show_progress_bar=False).astype(np.float32)

    def create_index(self, segments: List[Segment]) -> None:
        self._segments_ordered = segments
        texts = [seg.text for seg in segments]
        if not texts:
            self._index = None
            return

        embeddings = self._encode(texts)
        self._dim = embeddings.shape[1]

        import faiss
        self._index = faiss.IndexFlatIP(self._dim)
        self._index.add(embeddings)

        if self.index_path:
            os.makedirs(os.path.dirname(self.index_path), exist_ok=True)
            faiss.write_index(self._index, self.index_path)
            logger.info("Wrote FAISS index to %s (%d vectors)", self.index_path, len(segments))

    def search(self, query: str, top_k: int = 10) -> List[SearchResult]:
        if self._index is None or self._index.ntotal == 0 or not self._segments_ordered:
            return []

        query_vec = self._encode([query])
        scores_np, idxs = self._index.search(query_vec, min(top_k, self._index.ntotal))

        results: List[SearchResult] = []
        for rank in range(idxs.shape[1]):
            idx = int(idxs[0][rank])
            if idx < 0 or idx >= len(self._segments_ordered):
                continue
            seg = self._segments_ordered[idx]
            results.append(
                SearchResult(
                    segment_id=seg.segment_id,
                    score=float(scores_np[0][rank]),
                    text=seg.text,
                    metadata={"start_time": seg.start_time, "end_time": seg.end_time},
                )
            )
        return results

    def add_segment(self, segment: Segment) -> None:
        text = segment.text or ""
        embedding = self._encode([text])[0]
        segment.embedding = embedding

        self._segments_ordered.append(segment)
        import faiss
        if self._index is None:
            self._dim = embedding.shape[0]
            self._index = faiss.IndexFlatIP(self._dim)
        self._index.add(embedding.reshape(1, -1))
