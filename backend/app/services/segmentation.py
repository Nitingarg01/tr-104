from __future__ import annotations

import logging
import re
from collections import Counter
from typing import List, Optional, Tuple

import numpy as np
from sklearn.metrics.pairwise import cosine_similarity

from ..core.types import Segment, SegmentationError, TranscriptionChunk

logger = logging.getLogger(__name__)

MIN_SEGMENT_DURATION = 30.0   # merge segments shorter than this
MAX_SEGMENT_DURATION = 600.0  # split segments longer than this (advisory)
LEXICAL_WEIGHT = 0.3          # weight for lexical overlap in hybrid scoring
SEMANTIC_WEIGHT = 0.7         # weight for embedding similarity in hybrid scoring
BOUNDARY_PERCENTILE = 75      # percentile used for adaptive threshold


def _load_spacy():
    try:
        import spacy
        return spacy.load("en_core_web_sm")
    except Exception as e:
        raise SegmentationError(f"Failed to load spaCy model: {e}")


def _load_sentence_model():
    try:
        from sentence_transformers import SentenceTransformer
        return SentenceTransformer("all-MiniLM-L6-v2")
    except Exception as e:
        raise SegmentationError(f"Failed to load sentence transformer: {e}")


def _tokenize(text: str) -> set:
    return set(re.findall(r"[a-z']+", text.lower()))


def _jaccard_similarity(a: set, b: set) -> float:
    if not a or not b:
        return 0.0
    return len(a & b) / len(a | b)


def _split_into_sentences(transcript_data: List[TranscriptionChunk], nlp) -> List[dict]:
    records = []
    for chunk in transcript_data:
        text = chunk.text.strip()
        if not text:
            continue
        doc = nlp(text)
        sents = [s.text.strip() for s in doc.sents if s.text.strip()]
        if not sents:
            sents = [text]
        total_duration = max(chunk.end - chunk.start, 0.0)
        if len(sents) == 1 or total_duration <= 0.0:
            records.append({"text": sents[0], "start": chunk.start, "end": chunk.end})
            continue
        lengths = [max(len(s), 1) for s in sents]
        total_len = sum(lengths)
        cursor = chunk.start
        for idx, sent_text in enumerate(sents):
            if idx == len(sents) - 1:
                sent_end = chunk.end
            else:
                ratio = lengths[idx] / total_len
                sent_end = cursor + total_duration * ratio
            sent_end = min(max(sent_end, cursor), chunk.end)
            records.append({"text": sent_text, "start": cursor, "end": sent_end})
            cursor = sent_end
    return records


def _compute_gap_scores(sentences: List[dict], embed_model) -> np.ndarray:
    """Compute hybrid boundary score for each gap between sentences.

    Returns an array of length len(sentences)-1 where higher values
    indicate a stronger topic boundary.
    """
    n = len(sentences)
    if n < 2:
        return np.array([])

    texts = [s["text"] for s in sentences]
    embeddings = embed_model.encode(texts, batch_size=64, show_progress_bar=False)

    semantic_scores = np.zeros(n - 1)
    lexical_scores = np.zeros(n - 1)

    for i in range(n - 1):
        sem_sim = float(cosine_similarity([embeddings[i]], [embeddings[i + 1]])[0][0])
        semantic_scores[i] = 1.0 - sem_sim  # higher = less similar = boundary

        tokens_a = _tokenize(texts[i])
        tokens_b = _tokenize(texts[i + 1])
        lex_sim = _jaccard_similarity(tokens_a, tokens_b)
        lexical_scores[i] = 1.0 - lex_sim

    semantic_scores = _normalize(semantic_scores)
    lexical_scores = _normalize(lexical_scores)

    combined = SEMANTIC_WEIGHT * semantic_scores + LEXICAL_WEIGHT * lexical_scores
    return combined


def _normalize(arr: np.ndarray) -> np.ndarray:
    if arr.size == 0 or arr.max() == arr.min():
        return np.zeros_like(arr)
    return (arr - arr.min()) / (arr.max() - arr.min())


def _adaptive_threshold(scores: np.ndarray, percentile: float = BOUNDARY_PERCENTILE) -> float:
    if scores.size == 0:
        return 0.0
    return float(np.percentile(scores, percentile))


def _detect_boundaries_from_gaps(sentences: List[dict], embed_model) -> List[Tuple[float, int]]:
    """Detect boundaries with confidence scores.

    Returns list of (confidence, gap_index) sorted by confidence descending.
    """
    scores = _compute_gap_scores(sentences, embed_model)
    if scores.size == 0:
        return []

    threshold = _adaptive_threshold(scores)

    # Gather gaps above threshold with their confidence
    candidates = []
    for i, score in enumerate(scores):
        if score >= threshold:
            candidates.append((float(score), i))

    candidates.sort(key=lambda x: x[0], reverse=True)
    return candidates


def _merge_short_segments(segments: List[Segment], min_duration: float = MIN_SEGMENT_DURATION) -> List[Segment]:
    if len(segments) <= 1:
        return segments

    merged = []
    current = segments[0]

    for seg in segments[1:]:
        dur = current.end_time - current.start_time
        if dur < min_duration:
            current.end_time = seg.end_time
            current.text += " " + seg.text
            current.segment_id = min(current.segment_id, seg.segment_id)
        else:
            merged.append(current)
            current = seg

    dur = current.end_time - current.start_time
    if dur < min_duration and merged:
        merged[-1].end_time = current.end_time
        merged[-1].text += " " + current.text
    else:
        merged.append(current)

    for i, seg in enumerate(merged, 1):
        seg.segment_id = i

    return merged


def _validate_timestamps(segments: List[Segment], duration: float) -> List[Segment]:
    prev_end = 0.0
    for seg in segments:
        s = max(seg.start_time, prev_end)
        e = max(seg.end_time, s)
        s = min(max(s, 0.0), duration)
        e = min(max(e, s), duration)
        seg.start_time = round(s, 2)
        seg.end_time = round(e, 2)
        prev_end = e
    return segments


class SegmentationService:
    """Hybrid topic segmentation using embedding similarity + lexical overlap with soft scoring."""

    def __init__(self):
        self._nlp = None
        self._embed_model = None

    def _ensure_models(self):
        if self._nlp is None:
            self._nlp = _load_spacy()
        if self._embed_model is None:
            self._embed_model = _load_sentence_model()

    def segment_transcript(
        self,
        chunks: List[TranscriptionChunk],
        min_segment_duration: float = MIN_SEGMENT_DURATION,
    ) -> List[Segment]:
        """Segment a transcribed podcast into topic-based segments.

        Uses hybrid scoring (embedding cosine similarity + lexical Jaccard overlap)
        with adaptive thresholding and short-segment merging.

        Args:
            chunks: Transcribed chunks from TranscriptionService
            min_segment_duration: Merge segments shorter than this (seconds)

        Returns:
            List of Segment objects with topic boundaries
        """
        if not chunks:
            return []

        self._ensure_models()
        nlp = self._nlp
        embed_model = self._embed_model

        sentences = _split_into_sentences(chunks, nlp)
        if not sentences:
            full_text = " ".join(c.text for c in chunks if c.text.strip())
            duration = max((c.end for c in chunks), default=0.0)
            if not full_text.strip():
                return []
            segment = Segment(segment_id=1, start_time=0.0, end_time=duration, text=full_text)
            return _validate_timestamps([segment], duration)
        if len(sentences) < 3:
            full_text = " ".join(s["text"] for s in sentences)
            duration = max((s.end for s in sentences), default=0.0)
            start = sentences[0]["start"]
            end = sentences[-1]["end"]
            segment = Segment(segment_id=1, start_time=start, end_time=end, text=full_text)
            return _validate_timestamps([segment], duration)

        candidates = _detect_boundaries_from_gaps(sentences, embed_model)
        boundary_gaps = sorted([gap_idx for _, gap_idx in candidates])

        # Build segments from boundary gaps
        segments: List[Segment] = []
        prev_gap = -1
        seg_id = 1

        if not boundary_gaps:
            full_text = " ".join(s["text"] for s in sentences)
            start = sentences[0]["start"]
            end = sentences[-1]["end"]
            segments.append(Segment(segment_id=1, start_time=start, end_time=end, text=full_text))
        else:
            for gap_idx in boundary_gaps:
                if gap_idx <= prev_gap:
                    continue
                sent_ids = list(range(prev_gap + 1, gap_idx + 1))
                seg_text = " ".join(sentences[i]["text"] for i in sent_ids)
                segments.append(Segment(
                    segment_id=seg_id,
                    start_time=sentences[sent_ids[0]]["start"],
                    end_time=sentences[sent_ids[-1]]["end"],
                    text=seg_text,
                ))
                seg_id += 1
                prev_gap = gap_idx

            # Last segment
            if prev_gap < len(sentences) - 1:
                sent_ids = list(range(prev_gap + 1, len(sentences)))
                seg_text = " ".join(sentences[i]["text"] for i in sent_ids)
                segments.append(Segment(
                    segment_id=seg_id,
                    start_time=sentences[sent_ids[0]]["start"],
                    end_time=sentences[sent_ids[-1]]["end"],
                    text=seg_text,
                ))

        duration = max((c.end for c in chunks), default=0.0)
        segments = _validate_timestamps(segments, duration)
        segments = _merge_short_segments(segments, min_duration=min_segment_duration)

        logger.info(
            "Segmented %d sentences into %d segments (hybrid: %.0f%% semantic + %.0f%% lexical)",
            len(sentences), len(segments), SEMANTIC_WEIGHT * 100, LEXICAL_WEIGHT * 100,
        )
        return segments
