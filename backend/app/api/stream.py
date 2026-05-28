import asyncio
import json
import logging
import os
import threading

from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from ..services.transcription import TranscriptionService

logger = logging.getLogger(__name__)

router = APIRouter()

BASE_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", ".."))
CLEAN_AUDIO_DIR = os.path.join(BASE_DIR, "data", "clean_audio")

# Lazy singleton for the transcription service
_transcription_service = None


def _get_transcription_service():
    global _transcription_service
    if _transcription_service is None:
        _transcription_service = TranscriptionService(model_size="tiny", device="cpu", compute_type="int8")
    return _transcription_service


@router.websocket("/ws/captions/{episode_id}")
async def captions_ws(websocket: WebSocket, episode_id: str):
    await websocket.accept()
    audio_path = os.path.join(CLEAN_AUDIO_DIR, f"{episode_id}.wav")
    if not os.path.exists(audio_path):
        await websocket.send_json({"error": f"Audio file not found for episode: {episode_id}", "type": "error"})
        await websocket.close()
        return

    try:
        with open(audio_path, "rb") as f:
            audio_bytes = f.read()

        service = _get_transcription_service()

        # Offload CPU-bound Whisper transcription to a daemon thread so it
        # does NOT block the async event loop. Results stream back through
        # an asyncio.Queue so the coroutine can send chunks as they arrive.
        loop = asyncio.get_event_loop()
        queue: asyncio.Queue = asyncio.Queue(maxsize=16)

        def _transcribe():
            try:
                for chunk in service.transcribe_stream(audio_bytes, chunk_duration=2.0):
                    asyncio.run_coroutine_threadsafe(queue.put(("chunk", chunk)), loop).result()
                asyncio.run_coroutine_threadsafe(queue.put(("done", None)), loop).result()
            except Exception as exc:
                logger.error("Transcription thread error: %s", exc)
                asyncio.run_coroutine_threadsafe(queue.put(("error", exc)), loop).result()

        thread = threading.Thread(target=_transcribe, daemon=True)
        thread.start()

        while True:
            kind, data = await queue.get()
            if kind == "done":
                break
            if kind == "error":
                raise data  # type: ignore
            await websocket.send_json({
                "type": "caption",
                "text": data.text,
                "start": data.start,
                "end": data.end,
                "confidence": data.confidence,
                "speaker": data.speaker,
            })
    except WebSocketDisconnect:
        logger.info("WebSocket disconnected for episode: %s", episode_id)
        return
    except Exception as exc:
        logger.error("Streaming error for episode %s: %s", episode_id, exc)
        try:
            await websocket.send_json({"type": "error", "error": str(exc)})
        except Exception:
            pass
    finally:
        try:
            await websocket.close()
        except Exception:
            pass
