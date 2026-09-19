#!/usr/bin/env python3
"""Fluid Canvas - Offline Audio Feature Extraction."""

from __future__ import annotations

import argparse
import csv
import json
import sys
import urllib.request
from pathlib import Path
from typing import Any

import librosa
import numpy as np
import tensorflow as tf
import tensorflow_hub as hub

SAMPLE_RATE = 16_000
HOP_SECONDS = 0.10
MFCC_COUNT = 13
N_FFT = 1024
YAMNET_CONTEXT_SECONDS = 0.975

SEMANTIC_GROUPS = {
    "voice": ["Speech", "Conversation", "Narration"],
    "singing": ["Singing", "Choir", "Vocal music"],
    "music": ["Music", "Musical instrument", "Musical ensemble"],
    "drums": ["Drum", "Drum kit", "Snare drum", "Bass drum", "Percussion"],
    "bass": ["Bass guitar", "Double bass", "Bass drum"],
    "guitar": ["Guitar", "Electric guitar", "Acoustic guitar"],
    "piano": ["Piano"],
    "strings": ["Violin", "Cello", "String section", "Strings"],
    "electronic": ["Electronic music", "House music", "Techno", "Dubstep", "Drum and bass"],
    "ambient": ["Ambient music", "Background music"],
    "noise": ["Noise", "White noise", "Static", "Distortion"],
    "clap": ["Clapping", "Finger snapping"],
    "impact": ["Boom", "Thump", "Smash", "Explosion"],
}

def parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser()
    p.add_argument("input", type=Path)
    p.add_argument("-o", "--output", type=Path, required=True)
    return p.parse_args()

def load_audio(path: Path) -> tuple[np.ndarray, int]:
    if not path.exists():
        raise FileNotFoundError(path)
    print(f"Loading: {path}")
    audio, sr = librosa.load(path, sr=SAMPLE_RATE, mono=True)
    if not len(audio):
        raise ValueError("Audio file contains no samples.")
    print(f"Duration: {len(audio) / sr:.2f}s")
    return audio.astype(np.float32), sr

def raw_features(frame: np.ndarray, sr: int) -> dict[str, Any]:
    rms = float(np.sqrt(np.mean(np.square(frame))))

    zcr = float(librosa.feature.zero_crossing_rate(
        frame,
        frame_length=len(frame),
        hop_length=len(frame),
        center=False,
    )[0, 0])

    spectrum = np.abs(librosa.stft(
        frame,
        n_fft=N_FFT,
        hop_length=len(frame),
        center=False,
    ))

    centroid = float(librosa.feature.spectral_centroid(
        S=spectrum, sr=sr
    )[0, 0])

    bandwidth = float(librosa.feature.spectral_bandwidth(
        S=spectrum, sr=sr
    )[0, 0])

    rolloff = float(librosa.feature.spectral_rolloff(
        S=spectrum,
        sr=sr,
        roll_percent=0.85,
    )[0, 0])

    mfcc = librosa.feature.mfcc(
        y=frame,
        sr=sr,
        n_mfcc=MFCC_COUNT,
        n_fft=N_FFT,
        hop_length=len(frame),
        center=False,
    )[:, 0]

    return {
        "rms": rms,
        "zero_crossing_rate": zcr,
        "spectral_centroid": centroid,
        "spectral_bandwidth": bandwidth,
        "spectral_rolloff": rolloff,
        "mfcc": [float(x) for x in mfcc],
    }

class AudioModel:
    """Pretrained YAMNet semantic classifier."""

    def __init__(self) -> None:
        print("Loading YAMNet...")
        self.model = hub.load("https://tfhub.dev/google/yamnet/1")
        self.class_names = self._load_class_names()
        self.groups = self._build_groups()
        print(f"YAMNet loaded: {len(self.class_names)} classes")

    def _load_class_names(self) -> list[str]:
        cache = Path("data/yamnet_class_map.csv")
        cache.parent.mkdir(parents=True, exist_ok=True)

        if not cache.exists():
            url = (
                "https://raw.githubusercontent.com/tensorflow/models/"
                "master/research/audioset/yamnet/yamnet_class_map.csv"
            )
            urllib.request.urlretrieve(url, cache)

        with cache.open("r", encoding="utf-8") as f:
            return [row["display_name"] for row in csv.DictReader(f)]

    def _build_groups(self) -> dict[str, list[int]]:
        groups = {}

        for group, keywords in SEMANTIC_GROUPS.items():
            groups[group] = sorted({
                i for i, label in enumerate(self.class_names)
                if any(k.lower() in label.lower() for k in keywords)
            })

        return groups

    def predict(
        self,
        audio: np.ndarray,
        sample_rate: int,
    ) -> dict[str, float]:
        if sample_rate != SAMPLE_RATE:
            raise ValueError("YAMNet requires 16 kHz audio.")

        audio = np.nan_to_num(
            np.asarray(audio, dtype=np.float32)
        )

        waveform = tf.convert_to_tensor(audio, dtype=tf.float32)
        scores, _, _ = self.model(waveform)
        scores = np.max(scores.numpy(), axis=0)

        return {
            group: float(np.max(scores[indices]))
            if indices else 0.0
            for group, indices in self.groups.items()
        }

def extract(
    audio: np.ndarray,
    sr: int,
    model: AudioModel,
) -> list[dict[str, Any]]:
    hop = int(sr * HOP_SECONDS)
    frame_length = max(N_FFT, hop)
    context = int(sr * YAMNET_CONTEXT_SECONDS)
    frames = []

    for index, start in enumerate(
        range(0, len(audio) - frame_length + 1, hop)
    ):
        frame = audio[start:start + frame_length]

        model_frame = audio[start:start + context]

        if len(model_frame) < context:
            model_frame = np.pad(
                model_frame,
                (0, context - len(model_frame)),
            )

        features = raw_features(frame, sr)
        semantic = model.predict(model_frame, sr)

        frames.append({
            "index": index,
            "time": round(start / sr, 6),
            "features": features,
            "semantic": semantic,
        })

        if index and index % 100 == 0:
            print(f"Processed {index} frames ({start / sr:.1f}s)")

    return frames

def main() -> int:
    args = parse_args()

    try:
        audio, sr = load_audio(args.input)
        model = AudioModel()
        frames = extract(audio, sr, model)

        output = {
            "schema_version": "1.0",
            "source": {"filename": args.input.name},
            "analysis": {
                "sample_rate": sr,
                "hop_seconds": HOP_SECONDS,
                "n_fft": N_FFT,
                "mfcc_count": MFCC_COUNT,
                "yamnet_context_seconds": YAMNET_CONTEXT_SECONDS,
                "feature_order": [
                    "rms",
                    "zero_crossing_rate",
                    "spectral_centroid",
                    "spectral_bandwidth",
                    "spectral_rolloff",
                    "mfcc_0",
                    "mfcc_1",
                    "mfcc_2",
                    "mfcc_3",
                    "mfcc_4",
                    "mfcc_5",
                    "mfcc_6",
                    "mfcc_7",
                    "mfcc_8",
                    "mfcc_9",
                    "mfcc_10",
                    "mfcc_11",
                    "mfcc_12",
                    "voice",
                    "singing",
                    "music",
                    "drums",
                    "bass",
                    "guitar",
                    "piano",
                    "strings",
                    "electronic",
                    "ambient",
                    "noise",
                    "clap",
                    "impact",
                ],
                "input_size": 31,
                "temporal_smoothing": False,
                "temporal_interpolation": False,
                "rolling_normalization": False,
            },
            "frames": frames,
        }

        args.output.parent.mkdir(parents=True, exist_ok=True)

        with args.output.open("w", encoding="utf-8") as f:
            json.dump(output, f, indent=2, ensure_ascii=False)

        print(f"Saved: {args.output}")
        print(f"Frames: {len(frames)}")
        return 0

    except Exception as exc:
        print(f"ERROR: {exc}", file=sys.stderr)
        return 1

if __name__ == "__main__":
    raise SystemExit(main())
