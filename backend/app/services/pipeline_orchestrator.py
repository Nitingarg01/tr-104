from __future__ import annotations

import json
import logging
import os
import time
from typing import Callable, List, Optional

import numpy as np
from nltk.sentiment import SentimentIntensityAnalyzer
from ..config import settings
from ..core.types import (
    PipelineError,
    PipelineStage,
    STAGE_ORDER,
    STAGE_WEIGHTS,
    Segment,
    TranscriptionChunk,
)

from .audio_extractor import AudioExtractor
from .segmentation import SegmentationService
from .keywords import KeywordsService
from .summarization import SummarizationService
from .transcription import TranscriptionService
from .llm_summarizer import summarize_segments as llm_summarize_segments
from .llm_summarizer import summarize_full as llm_summarize_full
from .search import _get_model

logger = logging.getLogger(__name__)

BASE_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", ".."))
RAW_DIR = os.path.join(BASE_DIR, "data", "raw_audio")
CLEAN_DIR = os.path.join(BASE_DIR, "data", "clean_audio")
RESULT_DIR = os.path.join(BASE_DIR, "results")


ProgressCallback = Callable[[PipelineStage, float, Optional[str]], None]


class PipelineOrchestrator:
    """Orchestrates the full podcast processing pipeline using service modules."""

    def __init__(self):
        self.transcription = TranscriptionService()
        self.segmentation = SegmentationService()
        self.keywords = KeywordsService()
        self.summarization = SummarizationService()
        self.audio_extractor = AudioExtractor()
        self._sentiment = None
        self._embed_model = None

    def _get_sentiment(self):
        if self._sentiment is None:
            try:
                self._sentiment = SentimentIntensityAnalyzer()
            except LookupError:
                import nltk
                nltk.download("vader_lexicon")
                self._sentiment = SentimentIntensityAnalyzer()
        return self._sentiment

    def _get_embed_model(self):
        if self._embed_model is None:
            self._embed_model = _get_model()
        return self._embed_model

    def _progress(self, cb: Optional[ProgressCallback], stage: PipelineStage, text: Optional[str] = None):
        if cb:
            cb(stage, sum(STAGE_WEIGHTS[s] for s in STAGE_ORDER if s.value <= stage.value), text or stage.value)

    def run(
        self,
        audio_filename: str,
        on_progress: Optional[ProgressCallback] = None,
        skip_if_exists: bool = True,
    ) -> str:
        """Run the full pipeline on an audio file.

        Args:
            audio_filename: WAV filename in data/raw_audio/ (e.g. "podcast.wav")
            on_progress: Optional callback for progress updates
            skip_if_exists: If True, skip stages with existing outputs

        Returns:
            episode_id string
        """
        if not audio_filename.endswith(".wav"):
            audio_filename += ".wav"
        episode_id = audio_filename.replace(".wav", "")
        raw_path = os.path.join(RAW_DIR, audio_filename)
        clean_path = os.path.join(CLEAN_DIR, audio_filename)
        result_json = os.path.join(RESULT_DIR, f"{episode_id}.json")
        result_embed = os.path.join(RESULT_DIR, f"{episode_id}_embeddings.json")

        os.makedirs(CLEAN_DIR, exist_ok=True)
        os.makedirs(RESULT_DIR, exist_ok=True)

        if not os.path.exists(raw_path):
            raise PipelineError(f"Audio file not found: {raw_path}")

        # Step 1: Preprocessing
        self._progress(on_progress, PipelineStage.PREPROCESS, "Preprocessing audio...")
        clean_written = False
        if skip_if_exists and os.path.exists(clean_path):
            logger.info("Clean audio exists, skipping preprocessing")
        else:
            t0 = time.time()
            self.transcription.preprocess_audio(raw_path, clean_path)
            logger.info("Preprocessing done in %.2f sec", time.time() - t0)
            clean_written = True

        # Step 2: Transcription
        self._progress(on_progress, PipelineStage.TRANSCRIBE, "Transcribing audio...")
        json_path = os.path.join(BASE_DIR, "data", "transcripts", f"{episode_id}.json")
        if skip_if_exists and os.path.exists(json_path):
            logger.info("Transcript exists, loading from cache")
            with open(json_path, encoding="utf-8") as f:
                raw_segments = json.load(f)
            chunks = [
                TranscriptionChunk(
                    text=s.get("text", ""),
                    start=float(s.get("start", 0)),
                    end=float(s.get("end", 0)),
                )
                for s in raw_segments
            ]
        else:
            os.makedirs(os.path.dirname(json_path), exist_ok=True)
            t0 = time.time()
            audio_path = clean_path if os.path.exists(clean_path) else raw_path
            result_segments = self.transcription.transcribe_file(audio_path)
            chunks = [
                TranscriptionChunk(text=s.text, start=s.start, end=s.end, confidence=s.confidence)
                for s in result_segments
            ]
            raw_data = [{"text": s.text, "start": s.start, "end": s.end} for s in result_segments]
            with open(json_path, "w", encoding="utf-8") as f:
                json.dump(raw_data, f, indent=4)
            txt_path = os.path.join(BASE_DIR, "data", "transcripts", f"{episode_id}.txt")
            with open(txt_path, "w", encoding="utf-8") as f:
                for s in result_segments:
                    f.write(s.text.strip() + "\n")
            logger.info("Transcription done in %.2f sec", time.time() - t0)

        # Step 3: Parameter Tuning & Segmentation
        self._progress(on_progress, PipelineStage.TUNE, "Tuning segmentation parameters...")
        segments: List[Segment] = self.segmentation.segment_transcript(chunks)
        logger.info("Segmented into %d segments", len(segments))

        # Step 4: Keywords + topic labeling
        self._progress(on_progress, PipelineStage.KEYWORDS, "Extracting keywords...")
        segments = self.keywords.extract_keywords_from_segments(segments)
        for seg in segments:
            seg.topic = " & ".join(seg.keywords[:3]) if seg.keywords else ""

        # Step 5: Summarization (LLM via NVIDIA NIM if API key set, else BART)
        self._progress(on_progress, PipelineStage.SUMMARIZE, "Generating summaries...")
        nim_key = settings.NVIDIA_NIM_API_KEY or os.environ.get("NVIDIA_NIM_API_KEY", "")
        if nim_key:
            segments = llm_summarize_segments(segments, nim_key)
        else:
            segments = self.summarization.summarize_segments(segments)

        # Step 5b: Overall transcript summary
        overall_summary = ""
        if nim_key:
            full_text = " ".join(seg.text for seg in segments if seg.text.strip())
            if full_text:
                try:
                    overall_summary = llm_summarize_full(full_text, nim_key)
                except Exception as e:
                    logger.warning("Overall summary failed: %s", e)

        # Step 6: Sentiment
        self._progress(on_progress, PipelineStage.SENTIMENT, "Analyzing sentiment...")
        sia = self._get_sentiment()
        for seg in segments:
            seg.sentiment_score = round(sia.polarity_scores(seg.text)["compound"], 4)

        # Step 7: Embeddings (enrich)
        self._progress(on_progress, PipelineStage.ENRICH, "Computing embeddings...")
        embed_model = self._get_embed_model()
        texts = [s.text for s in segments]
        if texts:
            embeddings = embed_model.encode(texts, batch_size=64, show_progress_bar=False)

        duration = max((c.end for c in chunks), default=0.0)

        # Write result JSON
        output = {
            "episode_id": episode_id,
            "duration": round(duration, 2),
            "overall_summary": overall_summary,
            "segments": [
                {
                    "segment_id": seg.segment_id,
                    "start_time": seg.start_time,
                    "end_time": seg.end_time,
                    "text": seg.text,
                    "topic": seg.topic,
                    "keywords": seg.keywords,
                    "summary": seg.summary,
                    "sentiment_score": seg.sentiment_score,
                }
                for seg in segments
            ],
        }
        with open(result_json, "w", encoding="utf-8") as f:
            json.dump(output, f, indent=4)

        # Write embeddings JSON
        embeddings_output = {
            "episode_id": episode_id,
            "embedding_model": "all-MiniLM-L6-v2",
            "segments": [
                {
                    "segment_id": seg.segment_id,
                    "start_time": seg.start_time,
                    "end_time": seg.end_time,
                    "embedding": [round(float(v), 6) for v in embeddings[i].tolist()],
                }
                for i, seg in enumerate(segments)
            ],
        }
        with open(result_embed, "w", encoding="utf-8") as f:
            json.dump(embeddings_output, f, indent=4)

        self._progress(on_progress, PipelineStage.COMPLETED, "Pipeline complete")
        logger.info("Pipeline complete for %s: %d segments, %.2f sec", episode_id, len(segments), duration)
        return episode_id
