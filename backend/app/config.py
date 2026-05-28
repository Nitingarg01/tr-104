from __future__ import annotations

import os
from typing import List

from pydantic_settings import BaseSettings

# Resolve backend/.env using the file's own location so it works
# regardless of what directory uvicorn is launched from.
_HERE = os.path.dirname(os.path.abspath(__file__))          # backend/app/
_BACKEND_DIR = os.path.dirname(_HERE)                        # backend/
_ENV_FILE = os.path.join(_BACKEND_DIR, ".env")               # backend/.env


class Settings(BaseSettings):
    DATABASE_URL: str = "sqlite:///./test.db"
    REDIS_URL: str = "redis://localhost:6379/0"
    SECRET_KEY: str = "changeme"
    CORS_ORIGINS: List[str] = ["http://localhost:3000"]
    DEBUG: bool = False
    WHISPER_MODEL_SIZE: str = "tiny"
    SUMMARY_MODE: str = "abstractive"
    FAISS_INDEX_PATH: str = "./data/faiss_index"
    NVIDIA_NIM_API_KEY: str = ""
    NVIDIA_NIM_BASE_URL: str = "https://integrate.api.nvidia.com/v1"

    model_config = {"env_file": _ENV_FILE, "env_file_encoding": "utf-8", "extra": "ignore"}


settings = Settings()
