from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from fastapi.staticfiles import StaticFiles
from .config import settings
from .api import auth, stream, search
from .api.pipeline import api_router as pipeline_router
from .api.pipeline import media_router
from .services.search import _get_model
import os, logging

logger = logging.getLogger(__name__)

_BACKEND_DIR = os.path.dirname(os.path.abspath(__file__))  # backend/app/
_BASE_DIR = os.path.dirname(os.path.dirname(_BACKEND_DIR))  # project root
RAW_VIDEO_DIR = os.path.join(_BASE_DIR, "data", "raw_video")
RAW_AUDIO_DIR = os.path.join(_BASE_DIR, "data", "raw_audio")
CLEAN_AUDIO_DIR = os.path.join(_BASE_DIR, "data", "clean_audio")

"""FastAPI application entrypoint for the Universal AI Live Captioning backend."""

app = FastAPI(title="Universal AI Live Captioning Backend")

# GZip compression — compress all responses >= 1KB
app.add_middleware(GZipMiddleware, minimum_size=1024)

# CORS configuration
if settings.CORS_ORIGINS:
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.CORS_ORIGINS,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

# Health check endpoint
@app.get("/health")
async def health():
    return {"status": "ok", "version": "0.1.0"}

# Preload the ML model at startup so the first search request doesn't block for 10s
@app.on_event("startup")
async def preload_models():
    logger.info("Preloading SentenceTransformer model (all-MiniLM-L6-v2)…")
    try:
        _get_model()
        logger.info("SentenceTransformer model ready.")
    except Exception as e:
        logger.warning("Could not preload model: %s", e)

# Mount routers
app.include_router(auth.router, prefix="/auth")
app.include_router(stream.router, prefix="/stream")
app.include_router(search.router, prefix="/search")
app.include_router(pipeline_router, prefix="/api")

# Serve media files directly via StaticFiles — much faster than Python-backed
# FileResponse, with native support for Range requests (video seeking),
# conditional requests (304 Not Modified), and zero-copy sendfile where available.
os.makedirs(RAW_VIDEO_DIR, exist_ok=True)
app.mount("/media/video", StaticFiles(directory=RAW_VIDEO_DIR, check_dir=False), name="video")
app.mount("/media/raw", StaticFiles(directory=RAW_AUDIO_DIR, check_dir=False), name="raw_audio")
app.mount("/media/clean", StaticFiles(directory=CLEAN_AUDIO_DIR, check_dir=False), name="clean_audio")

# Keep the media_router imported & included so pipeline.py can still reference it
# for job-state endpoints if needed, even though file-serving routes are now static mounts.
app.include_router(media_router)
