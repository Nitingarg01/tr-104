from __future__ import annotations

import logging
import re
from typing import Callable, List, Optional

import spacy

from ..core.types import Segment, PipelineError

logger = logging.getLogger(__name__)

SUMMARY_MODE = "extractive"
SUMMARY_MODEL_NAME = "sshleifer/distilbart-cnn-12-6"
SUMMARY_CHUNK_CHARS = 1000
SUMMARY_RELEVANCE_MIN = 0.18
SUMMARY_MAX_SENTENCES = 2
SUMMARY_MAX_CHARS = 260
SUMMARY_BART_NUM_BEAMS = 2
SUMMARY_BART_CHUNK_MAX_LENGTH = 64
SUMMARY_BART_CHUNK_MIN_LENGTH = 16
SUMMARY_BART_FINAL_MAX_LENGTH = 78
SUMMARY_BART_FINAL_MIN_LENGTH = 20


class SummarizationError(PipelineError):
    pass


def _split_sentences(text: str) -> List[str]:
    parts = re.split(r"(?<=[.!?])\s+", text.strip())
    return [p.strip() for p in parts if p.strip()] or [text]


def _is_low_information(sentence: str) -> bool:
    normalized = " ".join(str(sentence or "").split()).strip()
    words = re.findall(r"[a-zA-Z']+", normalized.lower())
    if not words or len(words) < 6:
        return True
    if len(words) <= 4 and len(set(words)) <= 2:
        return True
    unique_ratio = len(set(words)) / max(len(words), 1)
    if len(words) <= 6 and unique_ratio < 0.45:
        return True
    lower = normalized.lower()
    if lower.startswith(("yeah", "oh", "um", "uh", "you know", "like ")) and len(words) < 12:
        return True
    if lower.endswith(("and", "or", "but", "so", "because", "that", "which")):
        return True
    return False


def _normalize_tokens(text: str) -> List[str]:
    cleaned = "".join(ch.lower() if ch.isalnum() or ch.isspace() else " " for ch in str(text))
    return [t for t in cleaned.split() if len(t) > 2]


def _summary_relevance(summary_text: str, source_text: str) -> float:
    src_tokens = set(_normalize_tokens(source_text))
    sum_tokens = _normalize_tokens(summary_text)
    if not src_tokens or not sum_tokens:
        return 0.0
    overlap = [t for t in sum_tokens if t in src_tokens]
    return len(overlap) / max(len(sum_tokens), 1)


def _chunk_text(text: str, nlp, max_chars: int = 1400) -> List[str]:
    doc = nlp(text)
    sents = [s.text.strip() for s in doc.sents if s.text.strip()]
    if not sents:
        return [text]
    chunks, current = [], ""
    for sent in sents:
        tentative = f"{current} {sent}".strip()
        if current and len(tentative) > max_chars:
            chunks.append(current)
            current = sent
        else:
            current = tentative
    if current:
        chunks.append(current)
    return chunks


def _summarize_extractive(text: str, nlp, max_sentences: int = 2, max_chars: int = 260) -> str:
    doc = nlp(text)
    sentences = [s.text.strip() for s in doc.sents if s.text.strip()]
    if not sentences:
        return ""
    filtered = [s for s in sentences if not _is_low_information(s)]
    candidates = filtered if filtered else sentences

    token_scores = {}
    for sent in candidates:
        for token in re.findall(r"[a-zA-Z']+", sent.lower()):
            if len(token) < 3 or token in {"yeah", "uh", "um", "hmm", "okay", "ok"}:
                continue
            token_scores[token] = token_scores.get(token, 0) + 1

    if not token_scores:
        summary = " ".join(candidates[:max_sentences]).strip()
        return summary if len(summary) <= max_chars else f"{summary[:max_chars].rstrip()}..."

    scored = []
    for idx, sent in enumerate(candidates):
        words = re.findall(r"[a-zA-Z']+", sent.lower())
        if not words:
            continue
        base = sum(token_scores.get(w, 0) for w in words) / max(len(words), 1)
        lead_bonus = 0.12 if idx == 0 else (0.06 if idx == 1 else 0.0)
        scored.append((idx, sent, base + lead_bonus))

    if not scored:
        summary = " ".join(candidates[:max_sentences]).strip()
        return summary if len(summary) <= max_chars else f"{summary[:max_chars].rstrip()}..."

    top = sorted(scored, key=lambda item: item[2], reverse=True)[:max_sentences]
    top = sorted(top, key=lambda item: item[0])
    summary = " ".join(item[1] for item in top).strip()
    return summary if len(summary) <= max_chars else f"{summary[:max_chars].rstrip()}..."


def _load_abstractive_summarizer() -> Optional[Callable]:
    try:
        import torch
        from transformers import AutoModelForSeq2SeqLM, AutoTokenizer

        tokenizer = AutoTokenizer.from_pretrained(SUMMARY_MODEL_NAME)
        model = AutoModelForSeq2SeqLM.from_pretrained(SUMMARY_MODEL_NAME)
        device = "cuda" if torch.cuda.is_available() else "cpu"
        model = model.to(device)

        def summarizer(text, max_length=78, min_length=20, do_sample=False, truncation=True):
            source = " ".join(str(text or "").split())
            if not source:
                return [{"summary_text": ""}]
            encoded = tokenizer(source, return_tensors="pt", truncation=truncation, max_length=1024)
            encoded = {k: v.to(device) for k, v in encoded.items()}
            generated = model.generate(
                **encoded,
                max_length=max_length,
                min_length=min_length,
                do_sample=do_sample,
                num_beams=SUMMARY_BART_NUM_BEAMS,
                no_repeat_ngram_size=3,
                early_stopping=True,
            )
            summary_text = tokenizer.decode(generated[0], skip_special_tokens=True).strip()
            return [{"summary_text": summary_text}]

        return summarizer
    except Exception as exc:
        logger.warning("Abstractive summarizer unavailable (%s). Falling back to extractive.", exc)
        return None


def _run_bart_summary(text: str, summarizer, max_length=78, min_length=20) -> str:
    out = summarizer(text, max_length=max_length, min_length=min_length)
    return out[0]["summary_text"].strip() if out else ""


def _summarize_abstractive(
    text: str,
    nlp,
    summarizer,
    source_text: str,
) -> str:
    chunks = _chunk_text(source_text, nlp, max_chars=SUMMARY_CHUNK_CHARS)
    if len(chunks) == 1:
        candidate = _run_bart_summary(
            chunks[0], summarizer,
            max_length=SUMMARY_BART_FINAL_MAX_LENGTH,
            min_length=SUMMARY_BART_FINAL_MIN_LENGTH,
        )
    else:
        chunk_summaries = [
            _run_bart_summary(chunk, summarizer,
                              max_length=SUMMARY_BART_CHUNK_MAX_LENGTH,
                              min_length=SUMMARY_BART_CHUNK_MIN_LENGTH)
            for chunk in chunks
        ]
        merged = " ".join(cs for cs in chunk_summaries if cs).strip()
        if not merged:
            return text
        candidate = _run_bart_summary(
            merged, summarizer,
            max_length=SUMMARY_BART_FINAL_MAX_LENGTH,
            min_length=SUMMARY_BART_FINAL_MIN_LENGTH,
        )
    if not candidate:
        return text
    relevance = _summary_relevance(candidate, source_text)
    return candidate if relevance >= SUMMARY_RELEVANCE_MIN else text


class SummarizationService:
    """Multi-mode summarization service with abstractive (BART), extractive, and fallback."""

    def __init__(self, mode: str = "extractive"):
        self.mode = mode
        self._nlp = None
        self._summarizer = None

    def _ensure_nlp(self):
        if self._nlp is None:
            try:
                self._nlp = spacy.load("en_core_web_sm")
            except Exception as e:
                raise SummarizationError(f"Failed to load spaCy: {e}")

    def _ensure_summarizer(self):
        if self._summarizer is None and self.mode in ("abstractive", "hybrid"):
            self._summarizer = _load_abstractive_summarizer()

    def summarize_segment(self, text: str) -> str:
        """Summarize a single segment."""
        self._ensure_nlp()
        if not text.strip():
            return ""

        if self.mode in ("extractive", "nltk"):
            return _summarize_extractive(text, self._nlp)

        self._ensure_summarizer()
        extractive = _summarize_extractive(text, self._nlp)
        if self._summarizer is None:
            return extractive

        source = text if self.mode == "abstractive" else extractive
        return _summarize_abstractive(text, self._nlp, self._summarizer, source)

    def summarize_full_transcript(self, segments: List[Segment]) -> str:
        """Summarize the full transcript from all segments."""
        full_text = " ".join(seg.text for seg in segments)
        return self.summarize_segment(full_text)

    def summarize_segments(self, segments: List[Segment]) -> List[Segment]:
        """Add summary to each segment in-place and return them."""
        self._ensure_nlp()
        self._ensure_summarizer()
        for seg in segments:
            seg.summary = self.summarize_segment(seg.text)
        logger.info("Summarized %d segments", len(segments))
        return segments
