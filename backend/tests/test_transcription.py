import io
import os
import tempfile
from importlib.util import spec_from_file_location, module_from_spec


def _load_module(path: str):
    spec = spec_from_file_location("test_module", path)
    module = module_from_spec(spec)  # type: ignore
    spec.loader.exec_module(module)  # type: ignore
    return module


def test_transcription_chunk_dataclass_fields():
    transcription_path = os.path.join(os.path.dirname(__file__), "..", "app", "services", "transcription.py")
    transcription_mod = _load_module(os.path.normpath(transcription_path))
    TranscriptionChunk = getattr(transcription_mod, "TranscriptionChunk")
    chunk = TranscriptionChunk(text="hello world", start=0.0, end=1.5, confidence=0.95, speaker=None)
    assert chunk.text == "hello world"
    assert chunk.start == 0.0
    assert chunk.end == 1.5


def test_audio_extractor_class_exists():
    audio_extractor_path = os.path.join(os.path.dirname(__file__), "..", "app", "services", "audio_extractor.py")
    audio_extractor_mod = _load_module(os.path.normpath(audio_extractor_path))
    AudioExtractor = getattr(audio_extractor_mod, "AudioExtractor")
    assert hasattr(AudioExtractor, "extract_from_file")


def test_vad_class_exists():
    vad_path = os.path.join(os.path.dirname(__file__), "..", "app", "services", "vad.py")
    vad_mod = _load_module(os.path.normpath(vad_path))
    VAD = getattr(vad_mod, "VAD")
    assert callable(getattr(VAD, "split_audio_by_speech"))
