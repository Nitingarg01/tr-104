import glob
import hashlib
import json
import os
import re
import subprocess
import threading
import time
import uuid
from datetime import datetime
from typing import Any, Dict, List, Optional, Tuple

from fastapi import APIRouter, Body, HTTPException, Request, UploadFile
from fastapi.responses import FileResponse, JSONResponse

from ..core.types import PipelineStage
from ..services.pipeline_orchestrator import PipelineOrchestrator

# ── Simple in-memory TTL cache ───────────────────────────────────────────────
# Avoids re-reading & JSON-parsing every result file on every request.
_cache_lock = threading.Lock()
_episode_list_cache: Optional[Tuple[float, List[Dict[str, Any]]]] = None  # (timestamp, data)
_episode_cache: Dict[str, Tuple[float, Dict[str, Any]]] = {}  # episode_id -> (timestamp, data)
EPISODE_LIST_TTL = 15.0   # seconds — refresh after a new episode is added
EPISODE_TTL = 120.0        # seconds — individual episode data (was 60s; safe to cache longer)


def _get_episode_list_cached() -> Optional[List[Dict[str, Any]]]:
    global _episode_list_cache
    with _cache_lock:
        if _episode_list_cache is not None:
            ts, data = _episode_list_cache
            if time.monotonic() - ts < EPISODE_LIST_TTL:
                return data
    return None


def _set_episode_list_cache(data: List[Dict[str, Any]]) -> None:
    global _episode_list_cache
    with _cache_lock:
        _episode_list_cache = (time.monotonic(), data)


def _get_episode_cached(episode_id: str) -> Optional[Dict[str, Any]]:
    with _cache_lock:
        entry = _episode_cache.get(episode_id)
        if entry is not None:
            ts, data = entry
            if time.monotonic() - ts < EPISODE_TTL:
                return data
    return None


def _set_episode_cache(episode_id: str, data: Dict[str, Any]) -> None:
    with _cache_lock:
        _episode_cache[episode_id] = (time.monotonic(), data)


def _invalidate_caches(episode_id: Optional[str] = None) -> None:
    """Bust caches when a pipeline job completes."""
    global _episode_list_cache
    with _cache_lock:
        _episode_list_cache = None
        if episode_id:
            _episode_cache.pop(episode_id, None)

BASE_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", ".."))
RAW_AUDIO_DIR = os.path.join(BASE_DIR, "data", "raw_audio")
RAW_VIDEO_DIR = os.path.join(BASE_DIR, "data", "raw_video")
CLEAN_AUDIO_DIR = os.path.join(BASE_DIR, "data", "clean_audio")
RESULTS_DIR = os.path.join(BASE_DIR, "results")

ALLOWED_AUDIO = {"wav", "mp3", "m4a", "flac", "ogg"}
ALLOWED_VIDEO = {"mp4", "mov", "mkv", "webm"}
ALLOWED_EXTENSIONS = ALLOWED_AUDIO | ALLOWED_VIDEO

api_router = APIRouter()
media_router = APIRouter()

# ── Job lifecycle management ──────────────────────────────────────────────────
# Prune completed/failed jobs by age + hard cap to prevent unbounded memory growth.
MAX_JOBS = 50
JOB_MAX_AGE_SECONDS = 3600

jobs: Dict[str, Dict[str, Any]] = {}
job_lock = threading.Lock()


def _prune_stale_jobs() -> None:
    now = datetime.utcnow()
    with job_lock:
        stale_ids = []
        for jid, job in jobs.items():
            status = job.get("status", "")
            if status in ("completed", "failed"):
                created = job.get("created_at", "")
                if created and created.endswith("Z"):
                    try:
                        created_dt = datetime.strptime(created[:-1], "%Y-%m-%dT%H:%M:%S.%f")
                    except ValueError:
                        created_dt = datetime.strptime(created[:-1], "%Y-%m-%dT%H:%M:%S")
                    age = (now - created_dt).total_seconds()
                    if age > JOB_MAX_AGE_SECONDS:
                        stale_ids.append(jid)

        for jid in stale_ids:
            del jobs[jid]

        if len(jobs) > MAX_JOBS:
            sorted_jobs = sorted(
                [(jid, job) for jid, job in jobs.items() if job.get("status") in ("completed", "failed")],
                key=lambda x: x[1].get("created_at", ""),
            )
            excess = len(jobs) - MAX_JOBS
            for jid, _ in sorted_jobs[:excess]:
                del jobs[jid]

os.makedirs(RAW_AUDIO_DIR, exist_ok=True)
os.makedirs(RAW_VIDEO_DIR, exist_ok=True)
os.makedirs(CLEAN_AUDIO_DIR, exist_ok=True)
os.makedirs(RESULTS_DIR, exist_ok=True)

_pipeline_orchestrator = None


def _get_orchestrator():
    global _pipeline_orchestrator
    if _pipeline_orchestrator is None:
        _pipeline_orchestrator = PipelineOrchestrator()
    return _pipeline_orchestrator


def now_iso() -> str:
    return datetime.utcnow().isoformat() + "Z"


def secure_filename(filename: str) -> str:
    name = os.path.basename(filename).strip()
    name = name.replace(" ", "_")
    name = re.sub(r"[^A-Za-z0-9_.-]", "", name)
    return name


def allowed_file(filename: str) -> bool:
    return "." in filename and filename.rsplit(".", 1)[1].lower() in ALLOWED_EXTENSIONS


def is_video_ext(filename: str) -> bool:
    return "." in filename and filename.rsplit(".", 1)[1].lower() in ALLOWED_VIDEO


def set_job(job_id: str, **updates: Any) -> None:
    with job_lock:
        if job_id not in jobs:
            return
        jobs[job_id].update(updates)
        jobs[job_id]["updated_at"] = now_iso()


def _find_file(base_dir: str, episode_id: str, exts: List[str]) -> Optional[str]:
    """Find a file with any of the given extensions (case-insensitive)."""
    for ext in exts:
        candidate = os.path.join(base_dir, f"{episode_id}.{ext}")
        if os.path.exists(candidate):
            return f"{episode_id}.{ext}"
    # Fallback: scan directory for file matching episode_id (case-insensitive)
    if os.path.exists(base_dir):
        for fname in os.listdir(base_dir):
            name, ext = os.path.splitext(fname)
            if name.lower() == episode_id.lower():
                return fname
    return None


def read_result(episode_id: str) -> Optional[Dict[str, Any]]:
    result_path = os.path.join(RESULTS_DIR, f"{episode_id}.json")
    if not os.path.exists(result_path):
        return None

    with open(result_path, "r", encoding="utf-8") as handle:
        data = json.load(handle)

    # Strip per-segment embedding vectors — they're large (768 floats each) and
    # not needed by the watch page. The search service loads embeddings separately.
    for seg in data.get("segments", []):
        seg.pop("embedding", None)

    audio_url = None
    video_url = None

    # Clean audio
    clean_candidate = os.path.join(CLEAN_AUDIO_DIR, f"{episode_id}.wav")
    if os.path.exists(clean_candidate):
        audio_url = f"/media/clean/{episode_id}.wav"

    # Raw audio (case-insensitive)
    raw = _find_file(RAW_AUDIO_DIR, episode_id, ["wav", "mp3", "m4a", "flac", "ogg"])
    if raw and not audio_url:
        audio_url = f"/media/raw/{raw}"

    # Video (case-insensitive)
    vid = _find_file(RAW_VIDEO_DIR, episode_id, ["mp4", "mov", "mkv", "webm"])
    if vid:
        video_url = f"/media/video/{vid}"

    data["audio_url"] = audio_url
    data["video_url"] = video_url
    data["media_type"] = "video" if video_url else "audio"
    return data


def find_downloaded_video(episode_id: str) -> Optional[str]:
    for ext in ["mp4", "mov", "mkv", "webm"]:
        candidate = os.path.join(RAW_VIDEO_DIR, f"{episode_id}.{ext}")
        if os.path.exists(candidate):
            return candidate
    return None


def download_video_from_url(url: str, episode_id: str):
    import yt_dlp

    outtmpl = os.path.join(RAW_VIDEO_DIR, f"{episode_id}.%(ext)s")
    ydl_opts = {
        "format": "bestvideo+bestaudio/best",
        "outtmpl": outtmpl,
        "merge_output_format": "mp4",
        "quiet": True,
    }

    with yt_dlp.YoutubeDL(ydl_opts) as ydl:
        ydl.download([url])

    video_path = find_downloaded_video(episode_id)
    if not video_path:
        raise FileNotFoundError("Video download failed. No video file found.")

    return video_path


def process_audio(job_id: str, audio_filename: str) -> None:
    orchestrator = _get_orchestrator()
    episode_id = audio_filename.replace(".wav", "")

    def on_progress(stage: PipelineStage, pct: float, text: Optional[str]):
        set_job(job_id, status="running", stage=stage.value, eta_seconds=max(0, int((1.0 - pct) * 300)))

    set_job(job_id, status="running", stage="pipeline_started", start_time=time.time())
    try:
        result_episode = orchestrator.run(audio_filename, on_progress=on_progress)
        result = read_result(result_episode)
        # Bust the list cache so next list request sees the new episode
        _invalidate_caches(result_episode)
        # Pre-populate episode cache with fresh data
        if result:
            _set_episode_cache(result_episode, result)
        set_job(
            job_id,
            status="completed",
            stage="completed",
            episode_id=result_episode,
            result=result,
            eta_seconds=0,
        )
    except Exception as exc:
        set_job(job_id, status="failed", stage="exception", error=str(exc))


def extract_audio_to_wav(input_path: str, output_path: str) -> None:
    subprocess.run(
        ["ffmpeg", "-y", "-i", input_path, "-ac", "1", "-ar", "16000", output_path],
        check=True, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True,
    )


def process_remote_media(job_id: str, media_url: str) -> None:
    set_job(job_id, status="running", stage="downloading_media")

    try:
        episode_id = uuid.uuid4().hex[:12]
        video_path = download_video_from_url(media_url, episode_id)
        audio_path = os.path.join(RAW_AUDIO_DIR, f"{episode_id}.wav")
        extract_audio_to_wav(video_path, audio_path)
        audio_filename = f"{episode_id}.wav"
        set_job(job_id, stage="pipeline_started", episode_id=episode_id, media_type="video")
        process_audio(job_id, audio_filename)
    except Exception as exc:
        set_job(job_id, status="failed", stage="download_failed", error=str(exc))


@api_router.post("/upload")
async def upload_audio(media: UploadFile) -> Dict[str, str]:
    if not media or not media.filename:
        raise HTTPException(status_code=400, detail="No file selected.")

    filename = secure_filename(media.filename)
    if not filename:
        filename = f"upload_{int(time.time())}.wav"

    if not allowed_file(filename):
        raise HTTPException(
            status_code=400,
            detail="Unsupported file type. Use wav, mp3, m4a, flac, or ogg.",
        )

    is_video = is_video_ext(filename)
    target_dir = RAW_VIDEO_DIR if is_video else RAW_AUDIO_DIR
    file_path = os.path.join(target_dir, filename)

    with open(file_path, "wb") as handle:
        handle.write(await media.read())

    episode_id = os.path.splitext(filename)[0]
    audio_filename = f"{episode_id}.wav"
    audio_path = os.path.join(RAW_AUDIO_DIR, audio_filename)

    ext = os.path.splitext(filename)[1].lower()
    if is_video or ext != ".wav":
        try:
            extract_audio_to_wav(file_path, audio_path)
        except Exception as exc:
            raise HTTPException(status_code=500, detail=f"Audio extraction failed: {exc}")

    _prune_stale_jobs()
    job_id = uuid.uuid4().hex
    jobs[job_id] = {
        "job_id": job_id,
        "status": "queued",
        "stage": "queued",
        "filename": filename,
        "episode_id": episode_id,
        "media_type": "video" if is_video else "audio",
        "created_at": now_iso(),
        "updated_at": now_iso(),
        "logs": [],
        "error": None,
        "result": None,
    }

    thread = threading.Thread(target=process_audio, args=(job_id, audio_filename), daemon=True)
    thread.start()

    return {"job_id": job_id, "status": "queued"}


@api_router.post("/ingest-url")
async def ingest_url(payload: Dict[str, str] = Body(default_factory=dict)) -> Dict[str, str]:
    media_url = (payload.get("url") or "").strip()
    if not media_url:
        raise HTTPException(status_code=400, detail="Missing media URL.")

    _prune_stale_jobs()
    job_id = uuid.uuid4().hex
    jobs[job_id] = {
        "job_id": job_id,
        "status": "queued",
        "stage": "queued",
        "filename": None,
        "episode_id": None,
        "media_type": "video",
        "created_at": now_iso(),
        "updated_at": now_iso(),
        "logs": ["URL ingest queued"],
        "error": None,
        "result": None,
    }

    thread = threading.Thread(target=process_remote_media, args=(job_id, media_url), daemon=True)
    thread.start()

    return {"job_id": job_id, "status": "queued"}


@api_router.get("/jobs")
async def list_jobs() -> List[Dict[str, Any]]:
    with job_lock:
        return [dict(job) for job in jobs.values()]


@api_router.get("/status/{job_id}")
async def job_status(job_id: str) -> Dict[str, Any]:
    job = jobs.get(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found.")
    return job


# Pause/resume are not available with in-process pipeline orchestration.
# The pipeline runs in a daemon thread and cannot be SIGSTOP'd.
# This is a future enhancement item: cooperative pause via threading.Event.


@api_router.get("/episodes")
async def list_episodes() -> JSONResponse:
    # Serve from cache if fresh
    cached = _get_episode_list_cached()
    if cached is not None:
        return JSONResponse(
            content={"episodes": cached},
            headers={"Cache-Control": "public, max-age=10, stale-while-revalidate=20"},
        )

    records = []
    pattern = os.path.join(RESULTS_DIR, "*.json")
    for path in glob.glob(pattern):
        if path.endswith("_embeddings.json"):
            continue
        try:
            with open(path, "r", encoding="utf-8") as handle:
                data = json.load(handle)
            episode_id = data.get("episode_id") or os.path.splitext(os.path.basename(path))[0]
            # Skip episodes whose video file has been deleted from disk.
            video = _find_file(RAW_VIDEO_DIR, episode_id, ["mp4", "mov", "mkv", "webm"])
            if not video:
                continue
            duration = float(data.get("duration", 0))
            segments = data.get("segments", [])
            records.append({
                "episode_id": episode_id,
                "duration": duration,
                "segment_count": len(segments),
                "updated_at": datetime.utcfromtimestamp(os.path.getmtime(path)).isoformat() + "Z",
            })
        except Exception:
            continue

    records.sort(key=lambda item: item["updated_at"], reverse=True)
    _set_episode_list_cache(records)
    return JSONResponse(
        content={"episodes": records},
        headers={"Cache-Control": "public, max-age=10, stale-while-revalidate=20"},
    )


@api_router.get("/transcript/{episode_id}")
async def get_transcript(episode_id: str) -> JSONResponse:
    """Return the raw Whisper transcript JSON for an episode (fine-grained sentence timing)."""
    transcript_path = os.path.join(BASE_DIR, "data", "transcripts", f"{episode_id}.json")
    if not os.path.exists(transcript_path):
        raise HTTPException(status_code=404, detail="Transcript not found.")
    try:
        with open(transcript_path, "r", encoding="utf-8") as f:
            data = json.load(f)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Failed to read transcript: {exc}")
    return JSONResponse(
        content=data,
        headers={"Cache-Control": "public, max-age=300, stale-while-revalidate=600"},
    )


@api_router.get("/episodes/{episode_id}")
async def get_episode(episode_id: str, request: Request) -> JSONResponse:
    # Serve from cache if fresh
    cached = _get_episode_cached(episode_id)
    if cached is not None:
        # Compute ETag from a stable hash of the cached data so unchanged
        # responses return 304 Not Modified instead of re-sending the body.
        etag = '"' + hashlib.md5(json.dumps(cached, sort_keys=True).encode()).hexdigest()[:16] + '"'
        if request.headers.get("if-none-match") == etag:
            return JSONResponse(content=None, status_code=304, headers={"ETag": etag})
        return JSONResponse(
            content=cached,
            headers={
                "Cache-Control": "public, max-age=30, stale-while-revalidate=60",
                "ETag": etag,
            },
        )

    data = read_result(episode_id)
    if data is None:
        raise HTTPException(status_code=404, detail="Episode result not found.")

    _set_episode_cache(episode_id, data)
    etag = '"' + hashlib.md5(json.dumps(data, sort_keys=True).encode()).hexdigest()[:16] + '"'
    if request.headers.get("if-none-match") == etag:
        return JSONResponse(content=None, status_code=304, headers={"ETag": etag})
    return JSONResponse(
        content=data,
        headers={
            "Cache-Control": "public, max-age=30, stale-while-revalidate=60",
            "ETag": etag,
        },
    )


@media_router.get("/media/raw/{filename}")
async def _serve_raw_audio(filename: str) -> FileResponse:
    """Fallback: most requests are handled by StaticFiles mount in main.py."""
    safe_name = secure_filename(filename)
    if not safe_name:
        raise HTTPException(status_code=400, detail="Invalid filename.")
    file_path = os.path.join(RAW_AUDIO_DIR, safe_name)
    if not os.path.exists(file_path):
        raise HTTPException(status_code=404, detail="File not found.")
    return FileResponse(file_path, headers={
        "Cache-Control": "public, max-age=86400, immutable",
        "Accept-Ranges": "bytes",
    })


@media_router.get("/media/video/{filename}")
async def _serve_video(filename: str) -> FileResponse:
    """Fallback: most requests are handled by StaticFiles mount in main.py."""
    safe_name = secure_filename(filename)
    if not safe_name:
        raise HTTPException(status_code=400, detail="Invalid filename.")
    file_path = os.path.join(RAW_VIDEO_DIR, safe_name)
    if not os.path.exists(file_path):
        raise HTTPException(status_code=404, detail="File not found.")
    return FileResponse(file_path, headers={
        "Cache-Control": "public, max-age=86400, immutable",
        "Accept-Ranges": "bytes",
    })


@media_router.get("/media/clean/{filename}")
async def _serve_clean_audio(filename: str) -> FileResponse:
    """Fallback: most requests are handled by StaticFiles mount in main.py."""
    safe_name = secure_filename(filename)
    if not safe_name:
        raise HTTPException(status_code=400, detail="Invalid filename.")
    file_path = os.path.join(CLEAN_AUDIO_DIR, safe_name)
    if not os.path.exists(file_path):
        raise HTTPException(status_code=404, detail="File not found.")
    return FileResponse(file_path, headers={
        "Cache-Control": "public, max-age=86400, immutable",
        "Accept-Ranges": "bytes",
    })
