from __future__ import annotations

import logging
import os
import subprocess
from typing import Optional

LOG = logging.getLogger("podcast.audio_extractor")


class AudioExtractionError(Exception):
    pass


class AudioExtractor:
    def __init__(self) -> None:
        self._logger = LOG

    def extract_from_file(self, file_path: str, output_path: str) -> None:
        if not os.path.exists(file_path):
            raise AudioExtractionError(f"Input file does not exist: {file_path}")
        cmd = ["ffmpeg", "-y", "-i", file_path, "-vn", "-acodec", "pcm_s16le", "-ar", "16000", "-ac", "1", output_path]
        try:
            subprocess.run(cmd, check=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
        except Exception as e:
            raise AudioExtractionError(f"Audio extraction from file failed: {e}")

    def extract_from_url(self, url: str, output_path: str) -> None:
        # Use yt-dlp to fetch and extract audio
        cmd = ["yt-dlp", "-x", "--audio-format", "wav", "-o", output_path, url]
        try:
            subprocess.run(cmd, check=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
        except Exception as e:
            raise AudioExtractionError(f"Audio extraction from URL failed: {e}")

    def get_video_info(self, url: str) -> dict:
        try:
            cmd = ["yt-dlp", "-J", url]
            result = subprocess.run(cmd, check=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
            import json
            return json.loads(result.stdout.decode("utf-8"))
        except Exception as e:
            raise AudioExtractionError(f"Failed to fetch video info: {e}")
