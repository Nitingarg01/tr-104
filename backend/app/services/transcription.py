import io
import logging
import os
import tempfile
from dataclasses import dataclass
from typing import Generator, List, Optional, Tuple

# Optional heavy dependencies are imported lazily
try:
    import librosa
except Exception:  # pragma: no cover
    librosa = None  # type: ignore
try:
    import numpy as np
except Exception:  # pragma: no cover
    np = None  # type: ignore

try:
    from faster_whisper import WhisperModel
except Exception:  # pragma: no cover
    WhisperModel = None  # type: ignore


EXCEPTION_LOGGER = logging.getLogger("podcast.transcription")


class TranscriptionError(Exception):
    pass


class AudioExtractionError(Exception):
    pass


class VADError(Exception):
    pass


@dataclass
class TranscriptionChunk:
    text: str
    start: float
    end: float
    confidence: float
    speaker: Optional[str] = None


def _log(msg: str, **kwargs) -> None:
    EXCEPTION_LOGGER.info(msg, extra={"extra": kwargs})


class StreamingTranscriber:
    """Real-time streaming transcriber wrapper around a Faster-Whisper model.

    This implementation provides a pragmatic streaming interface. It writes the
    incoming audio to temporary WAV files and transcribes in fixed-size chunks
    by reusing the batch transcription for each chunk when possible.
    """

    def __init__(self, model: Optional[object], chunk_duration: float = 2.0) -> None:
        self.model = model
        self.chunk_duration = chunk_duration
        self._logger = logging.getLogger("podcast.transcription.streaming")

    def _ensure_model(self) -> None:
        if self.model is None:
            raise TranscriptionError("StreamingTranscriber requires a valid model instance")

    def stream(self, audio_stream: bytes) -> Generator[TranscriptionChunk, None, None]:
        """Stream transcription for a WAV byte stream in fixed chunks."""
        self._ensure_model()
        if not audio_stream:
            return

        try:
            import soundfile as sf
        except Exception as e:  # pragma: no cover
            raise TranscriptionError("soundfile is required for streaming transcription") from e

        # Decode bytes to wav-like numpy array
        with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as tmp:
            tmp_path = tmp.name
            tmp.close()
            try:
                y, sr = sf.read(io.BytesIO(audio_stream))
            except Exception:
                # If cannot decode, bail out gracefully
                return

            if y is None:
                return
            if y.ndim > 1:
                y = y.mean(axis=1)
            if sr != 16000:
                if librosa is None:
                    raise TranscriptionError("librosa is required for resampling in streaming mode")
                y = librosa.resample(y, orig_sr=sr, target_sr=16000)
                sr = 16000
            sf.write(tmp_path, y, sr)

        try:
            duration = librosa.get_duration(y=y, sr=sr) if (librosa is not None) else 0.0
        except Exception:
            duration = 0.0
        samples_per_chunk = int(self.chunk_duration * sr) if sr > 0 else 0
        if np is not None:
            valid_ndarray = isinstance(y, (list, tuple, np.ndarray))
        else:
            valid_ndarray = isinstance(y, (list, tuple))
        total_samples = len(y) if valid_ndarray else 0

        if total_samples == 0 or samples_per_chunk <= 0:
            return

        for start_idx in range(0, total_samples, samples_per_chunk):
            end_idx = min(start_idx + samples_per_chunk, total_samples)
            chunk = y[start_idx:end_idx]

            with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as chunk_tmp:
                chunk_path = chunk_tmp.name
                sf.write(chunk_path, chunk, sr)

            try:
                if hasattr(self.model, "transcribe"):
                    segments_gen, _info = self.model.transcribe(chunk_path, task="translate")  # type: ignore
                    for seg in segments_gen:
                        yield TranscriptionChunk(
                            text=seg.text.strip(),
                            start=float(seg.start) + (start_idx / sr),
                            end=float(seg.end) + (start_idx / sr),
                            confidence=float(seg.avg_logprob) if hasattr(seg, 'avg_logprob') else 0.0,
                        )
            finally:
                try:
                    os.remove(chunk_path)
                except Exception:
                    pass

        try:
            os.remove(tmp_path)
        except Exception:
            pass


class TranscriptionService:
    def __init__(self, model_size: str = "tiny", device: str = "cpu", compute_type: str = "int8") -> None:
        self.model_size = model_size
        self.device = device
        self.compute_type = compute_type
        self.model = None
        self._logger = logging.getLogger("podcast.transcription.service")

    def _ensure_model(self) -> None:
        if self.model is not None:
            return
        if WhisperModel is None:  # type: ignore
            raise TranscriptionError("Faster-Whisper not installed; cannot initialize model")
        try:
            self.model = WhisperModel(self.model_size, device=self.device, compute_type=self.compute_type)  # type: ignore
            _log("Transcription model loaded", model_size=self.model_size)
        except Exception as e:  # pragma: no cover
            raise TranscriptionError(f"Failed to load transcription model: {e}")

    def transcribe_file(self, audio_path: str) -> List[TranscriptionChunk]:
        self._ensure_model()
        if not os.path.exists(audio_path):
            raise TranscriptionError(f"Audio file not found: {audio_path}")
        duration = 0.0
        if librosa is not None:
            try:
                y, sr = librosa.load(audio_path, sr=None, mono=True)
                duration = float(librosa.get_duration(y=y, sr=sr))
            except Exception:
                duration = 0.0

        chunks: List[TranscriptionChunk] = []
        try:
            segments_gen, info = self.model.transcribe(audio_path, task="translate")  # type: ignore
            for seg in segments_gen:
                chunks.append(
                    TranscriptionChunk(
                        text=seg.text.strip(),
                        start=float(seg.start),
                        end=float(seg.end) or duration,
                        confidence=float(seg.avg_logprob) if hasattr(seg, 'avg_logprob') else 0.0,
                    )
                )
        except Exception:
            pass

        if not chunks:
            chunks.append(TranscriptionChunk(text="", start=0.0, end=duration, confidence=0.0, speaker=None))
        return chunks

    def transcribe_stream(self, audio_stream: bytes, chunk_duration: float = 2.0) -> Generator[TranscriptionChunk, None, None]:  # type: ignore
        self._ensure_model()
        if not audio_stream:
            return
        transcriber = StreamingTranscriber(self.model, chunk_duration=chunk_duration)
        yield from transcriber.stream(audio_stream)

    def extract_audio(self, video_path: str, output_path: str) -> None:
        import subprocess
        cmd = ["ffmpeg", "-y", "-i", video_path, "-vn", "-acodec", "pcm_s16le", "-ar", "16000", "-ac", "1", output_path]
        try:
            subprocess.run(cmd, check=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
        except Exception as e:
            raise AudioExtractionError(f"Failed to extract audio: {e}")

    def preprocess_audio(self, input_path: str, output_path: str, sample_rate: int = 16000) -> None:
        try:
            if librosa is None:
                raise TranscriptionError("librosa is required for preprocessing audio")
            y, sr = librosa.load(input_path, sr=None, mono=True)
            if sr != sample_rate:
                y = librosa.resample(y, orig_sr=sr, target_sr=sample_rate)
            try:
                import noisereduce as nr
                y = nr.reduce_noise(y=y, sr=sample_rate)
            except Exception:
                pass
            max_val = max(abs(y).max(), 1e-8)
            y = y / max_val
            import soundfile as sf
            sf.write(output_path, y, sample_rate)
        except Exception as e:
            raise TranscriptionError(f"Failed to preprocess audio: {e}")
