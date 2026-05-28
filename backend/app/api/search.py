import asyncio
import json
import os
from typing import Any, Dict, List, Optional

import numpy as np
from fastapi import APIRouter

from ..config import settings
from ..schemas.search import (
    AskRequest,
    AskResponse,
    Citation,
    SearchRequest,
    SearchResponse,
    SearchResult,
)
from ..services.search import _get_model
from ..services.llm_summarizer import _call_nim

router = APIRouter()

BASE_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", ".."))
RESULTS_DIR = os.path.join(BASE_DIR, "results")


def _load_embeddings_for_episode(episode_id: str) -> List[Dict[str, Any]]:
    embed_path = os.path.join(RESULTS_DIR, f"{episode_id}_embeddings.json")
    if not os.path.exists(embed_path):
        return []
    with open(embed_path, "r", encoding="utf-8") as handle:
        data = json.load(handle)
    return data.get("segments", []) if isinstance(data, dict) else []


def _load_episode_segments(episode_id: str) -> List[Dict[str, Any]]:
    result_path = os.path.join(RESULTS_DIR, f"{episode_id}.json")
    if not os.path.exists(result_path):
        return []
    with open(result_path, "r", encoding="utf-8") as handle:
        data = json.load(handle)
    return data.get("segments", []) if isinstance(data, dict) else []


def _cosine_scores(matrix: np.ndarray, query_vec: np.ndarray) -> np.ndarray:
    if matrix.size == 0:
        return np.array([], dtype=np.float32)
    denom = (np.linalg.norm(matrix, axis=1) * (np.linalg.norm(query_vec) + 1e-12)) + 1e-12
    return matrix.dot(query_vec) / denom


@router.post("/", response_model=SearchResponse)
async def search(payload: SearchRequest):
    query = (payload.query or "").strip()
    if not query:
        return SearchResponse(results=[])

    loop = asyncio.get_event_loop()
    model = _get_model()
    query_vec = await loop.run_in_executor(
        None, lambda: model.encode([query], normalize_embeddings=True)[0]
    )
    query_vec = np.asarray(query_vec, dtype=np.float32)

    results: List[SearchResult] = []
    for filename in os.listdir(RESULTS_DIR):
        if not filename.endswith(".json") or filename.endswith("_embeddings.json"):
            continue
        episode_id = filename.replace(".json", "")
        # If caller scoped to a specific episode, skip others
        if payload.episode_id and episode_id != payload.episode_id:
            continue
        segments = _load_episode_segments(episode_id)
        embedding_segments = _load_embeddings_for_episode(episode_id)
        if not segments or not embedding_segments:
            continue

        embedding_map = {
            int(seg.get("segment_id")): np.asarray(seg.get("embedding", []), dtype=np.float32)
            for seg in embedding_segments
            if seg.get("embedding")
        }
        matrix_rows = []
        segment_refs = []
        for seg in segments:
            seg_id = int(seg.get("segment_id") or 0)
            vec = embedding_map.get(seg_id)
            if vec is None or vec.size == 0:
                continue
            matrix_rows.append(vec)
            segment_refs.append(seg)
        if not matrix_rows:
            continue

        matrix = np.stack(matrix_rows, axis=0)
        scores = _cosine_scores(matrix, query_vec)
        for idx, score in enumerate(scores):
            seg = segment_refs[idx]
            results.append(
                SearchResult(
                    episode_id=episode_id,
                    segment_id=int(seg.get("segment_id") or 0),
                    score=float(score),
                    start_time=float(seg.get("start_time") or 0),
                    end_time=float(seg.get("end_time") or 0),
                    text=str(seg.get("text") or ""),
                    summary=seg.get("summary"),
                    keywords=seg.get("keywords") or [],
                )
            )

    results.sort(key=lambda r: r.score, reverse=True)
    limit = payload.limit or 10
    # Filter out low-relevance results — cosine similarity below 0.15 is noise
    results = [r for r in results if r.score >= 0.15]
    return SearchResponse(results=results[:limit])


RAG_SYSTEM_PROMPT = """You are a video content analyst. Answer using ONLY the transcript below. Be detailed and thorough.

Strict format — use ONLY this structure, NO headers:

- **Direct Answer**: 2-4 sentence direct answer to the question. No preamble.
- **Key Details**:
  - Break down every relevant point found in the transcript
  - Use **bold** for key terms, names, tools, topics
  - Use indented bullets for sub-points under each detail
  - Cover all details mentioned — be comprehensive
- **Summary**: 1-2 sentence wrap-up of the most important takeaway

CRITICAL RULES:
- NEVER use ## or any markdown headers
- NEVER start with "Based on", "The transcript", "The segments", "The video", or similar preamble
- NEVER mention segment IDs like [Segment 23]
- Be thorough — include every relevant detail from the transcript"""


@router.post("/ask", response_model=AskResponse)
async def ask(payload: AskRequest):
    question = (payload.question or "").strip()
    if not question:
        return AskResponse(answer="", citations=[])

    nim_key = settings.NVIDIA_NIM_API_KEY or os.environ.get("NVIDIA_NIM_API_KEY", "")
    if not nim_key:
        return AskResponse(answer="LLM API key not configured. Set NVIDIA_NIM_API_KEY in backend/.env", citations=[])

    try:
        # Phase 1: collect matching episode IDs
        episode_ids: List[str] = []
        for filename in os.listdir(RESULTS_DIR):
            if not filename.endswith(".json") or filename.endswith("_embeddings.json"):
                continue
            eid = filename.replace(".json", "")
            if payload.episodes and eid not in payload.episodes:
                continue
            episode_ids.append(eid)

        if not episode_ids:
            return AskResponse(answer="No relevant segments found for your question.", citations=[])

        # Phase 2: encode query ONCE (not per episode)
        loop = asyncio.get_event_loop()
        model = _get_model()
        query_vec = await loop.run_in_executor(
            None, lambda: model.encode([question], normalize_embeddings=True)[0]
        )
        query_vec = np.asarray(query_vec, dtype=np.float32)

        # Phase 3: score all matching episodes IN PARALLEL
        def _score_episode(eid: str) -> List[Dict[str, Any]]:
            segs = _load_episode_segments(eid)
            embed_segs = _load_embeddings_for_episode(eid)
            if not segs or not embed_segs:
                return []

            embedding_map = {
                int(seg.get("segment_id")): np.asarray(seg.get("embedding", []), dtype=np.float32)
                for seg in embed_segs if seg.get("embedding")
            }

            results = []
            for seg in segs:
                seg_id = int(seg.get("segment_id") or 0)
                vec = embedding_map.get(seg_id)
                if vec is None or vec.size == 0:
                    continue
                score = float(_cosine_scores(vec.reshape(1, -1), query_vec)[0])
                results.append({
                    "episode_id": eid,
                    "segment_id": seg_id,
                    "score": score,
                    "start_time": float(seg.get("start_time") or 0),
                    "end_time": float(seg.get("end_time") or 0),
                    "text": str(seg.get("text") or ""),
                    "summary": seg.get("summary"),
                })
            return results

        tasks = [loop.run_in_executor(None, _score_episode, eid) for eid in episode_ids]
        episode_results: List[List[Dict[str, Any]]] = await asyncio.gather(*tasks)

        # Phase 4: flatten, sort, take top_k
        segments_list = [item for sublist in episode_results for item in sublist]
        segments_list.sort(key=lambda x: x["score"], reverse=True)
        top_k = segments_list[: payload.top_k]

        if not top_k:
            return AskResponse(answer="No relevant segments found for your question.", citations=[])

        context_parts = []
        for seg in top_k:
            time_str = f"{seg['start_time']:.1f}s - {seg['end_time']:.1f}s"
            context_parts.append(
                f"[Segment {seg['segment_id']}] (Episode: {seg['episode_id']}, Time: {time_str})\n{seg['text'][:800]}"
            )

        context = "\n\n".join(context_parts)
        prompt = f"Answer the question based on these transcript segments:\n\n{context}\n\nQuestion: {question}"

        from ..services.llm_summarizer import LLMUnavailableError
        answer = await loop.run_in_executor(
            None,
            lambda: _call_nim(prompt, RAG_SYSTEM_PROMPT, nim_key, max_tokens=1024)
        )

        citations = [
            Citation(
                episode_id=s["episode_id"],
                segment_id=s["segment_id"],
                start_time=s["start_time"],
                end_time=s["end_time"],
                text=s["text"][:200],
                relevance_score=round(s["score"], 4),
            )
            for s in top_k
        ]

        return AskResponse(answer=answer, citations=citations)

    except LLMUnavailableError as e:
        return AskResponse(answer=f"LLM unavailable: {e}", citations=[])
    except Exception as e:
        import logging
        logging.getLogger(__name__).error(f"Ask endpoint error: {e}", exc_info=True)
        return AskResponse(answer=f"Error processing your question: {str(e)}", citations=[])
