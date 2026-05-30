from __future__ import annotations

import json
import logging
from typing import List, Optional
from urllib import request as ureq
from urllib.error import URLError

from ..core.types import Segment

logger = logging.getLogger(__name__)

NIM_BASE = "https://integrate.api.nvidia.com/v1"
DEFAULT_MODEL = "meta/llama-3.1-8b-instruct"

SYSTEM_PROMPT = """You are a podcast segment analyst. Your sole job: write ONE sentence (max 20 words) that captures the single most important idea in this segment.

Rules:
- Output ONLY the one sentence. Nothing else. No labels, no bullets, no topic line.
- Plain text. No markdown, no asterisks, no bold.
- Be specific — name the concept, tool, or insight. No vague phrases like 'the speaker discusses'.
- If no clear idea exists, output: 'No clear topic identified.'"""

FULL_SUMMARIZE_SYSTEM = """You are a podcast content analyst. Given the full transcript, produce a concise plain-text summary:

- 4-5 sentences — enough to cover the main topic and key points clearly
- Plain text only — NO markdown, NO asterisks, NO bullets, NO sections
- A short paragraph describing what the episode covers and the main takeaways
- Be clear and informative, but still concise"""


class LLMUnavailableError(Exception):
    pass


def _call_nim(
    prompt: str,
    system_prompt: str,
    api_key: str,
    model: str = DEFAULT_MODEL,
    max_tokens: int = 400,
) -> str:
    """Call NVIDIA NIM via OpenAI-compatible chat completions endpoint."""
    url = f"{NIM_BASE}/chat/completions"
    payload = json.dumps(
        {
            "model": model,
            "messages": [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": prompt},
            ],
            "max_tokens": max_tokens,
            "temperature": 0.3,
        }
    ).encode("utf-8")

    req = ureq.Request(
        url,
        data=payload,
        headers={
            "Content-Type": "application/json",
            "Authorization": f"Bearer {api_key}",
        },
        method="POST",
    )

    try:
        with ureq.urlopen(req, timeout=60) as resp:
            result = json.loads(resp.read().decode("utf-8"))
        text = (
            result.get("choices", [{}])[0]
            .get("message", {})
            .get("content", "")
        )
        if not text:
            raise LLMUnavailableError("Empty response from NVIDIA NIM")
        return text.strip()
    except URLError as e:
        raise LLMUnavailableError(f"NVIDIA NIM API call failed: {e}")
    except (KeyError, IndexError, json.JSONDecodeError) as e:
        raise LLMUnavailableError(f"Unexpected NVIDIA response: {e}")


def summarize_segment(
    text: str, api_key: str, model: str = DEFAULT_MODEL
) -> str:
    """Summarize a single segment using NVIDIA NIM."""
    if not text.strip():
        return ""
    try:
        return _call_nim(
            f"Summarize this podcast segment crisply:\n\n{text[:3000]}",
            SYSTEM_PROMPT,
            api_key,
            model,
            max_tokens=400,
        )
    except LLMUnavailableError as e:
        logger.warning("LLM summarization failed: %s", e)
        return ""


def summarize_segments(
    segments: List[Segment], api_key: str, model: str = DEFAULT_MODEL
) -> List[Segment]:
    """Summarize all segments using LLM, falls back to empty on error."""
    for seg in segments:
        summary = summarize_segment(seg.text, api_key, model)
        if summary:
            seg.summary = summary
    logger.info("LLM-summarized %d segments via NVIDIA NIM", len(segments))
    return segments


def summarize_full(
    text: str, api_key: str, model: str = DEFAULT_MODEL
) -> str:
    """Summarize full transcript using NVIDIA NIM."""
    if not text.strip():
        return ""
    try:
        return _call_nim(
            f"Summarize this full podcast transcript crisply:\n\n{text[:8000]}",
            FULL_SUMMARIZE_SYSTEM,
            api_key,
            model,
            max_tokens=600,
        )
    except LLMUnavailableError as e:
        logger.warning("LLM full summarization failed: %s", e)
        return ""
