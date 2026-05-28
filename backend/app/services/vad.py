from __future__ import annotations

import os
import numpy as np
import librosa

from typing import List, Tuple, Optional


class VADError(Exception):
    pass


class VAD:
    def __init__(self, energy_threshold: Optional[float] = None) -> None:
        self.energy_threshold = energy_threshold

    def _frame_energy(self, frame: np.ndarray) -> float:
        return float(np.sum(frame ** 2) / max(len(frame), 1))

    def split_audio_by_speech(self, audio_path: str, min_speech_duration: float = 1.0) -> List[Tuple[float, float]]:
        """Naive energy-based VAD segmentation.

        Returns list of (start_sec, end_sec) tuples for detected speech blocks.
        This is a simple baseline implementation and is not intended to replace
        production-grade VAD models.
        """
        if not audio_path or not os.path.exists(audio_path):
            raise VADError("Audio file not found for VAD")
        try:
            y, sr = librosa.load(audio_path, sr=None, mono=True)
        except Exception as e:
            raise VADError(f"Failed to load audio for VAD: {e}")

        if sr <= 0:
            raise VADError("Invalid sample rate for VAD")

        frame_length = int(0.02 * sr)  # 20 ms frames
        hop_length = int(0.01 * sr)    # 10 ms hops
        # Compute energy per frame
        energies = []
        for i in range(0, len(y) - frame_length, hop_length):
            frame = y[i:i + frame_length]
            energies.append(self._frame_energy(frame))
        energies = np.array(energies)
        if self.energy_threshold is None:
            thresh = max(energies.mean() * 1.0, 1e-4)
        else:
            thresh = self.energy_threshold

        speech_segments: List[Tuple[float, float]] = []
        in_speech = False
        speech_start = 0.0
        for idx, e in enumerate(energies):
            t = idx * hop_length / sr
            if e >= thresh and not in_speech:
                in_speech = True
                speech_start = t
            elif e < thresh and in_speech:
                in_speech = False
                speech_end = t
                if speech_end - speech_start >= min_speech_duration:
                    speech_segments.append((speech_start, speech_end))
        # If file ends while in speech
        if in_speech:
            speech_end = len(energies) * hop_length / sr
            if speech_end - speech_start >= min_speech_duration:
                speech_segments.append((speech_start, speech_end))
        return speech_segments
