#!/usr/bin/env python3
"""
Fluid Canvas
Audio Understanding Model

Purpose
-------
Run a pretrained general-purpose audio classification model on
individual audio frames.

This module is intentionally separate from feature extraction.

Architecture:

    MP3
     |
     v
    Audio frame
     |
     v
    YAMNet
     |
     v
    521 audio-class probabilities
     |
     v
    Selected semantic categories
     |
     v
    JSON

IMPORTANT
---------
This module does NOT:

- smooth predictions
- average predictions over time
- use EMA
- use rolling normalization
- interpolate predictions

Every input frame is evaluated independently.

The model is pretrained. We are NOT training YAMNet.

Requirements
------------
    pip install tensorflow tensorflow-hub numpy

YAMNet is approximately a general audio-event classifier. It provides
many low-level semantic audio categories that are useful for the
Fluid Canvas visual mapping system.

The model adapter is deliberately isolated so that a different
pretrained audio model can be substituted later.
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path
from typing import Any

import numpy as np


# ============================================================
# OPTIONAL HEAVY IMPORTS
# ============================================================

try:
    import tensorflow as tf
    import tensorflow_hub as hub
except ImportError:
    tf = None
    hub = None


# ============================================================
# CONFIGURATION
# ============================================================

YAMNET_URL = (
    "https://tfhub.dev/google/yamnet/1"
)

DEFAULT_THRESHOLD = 0.05


# ============================================================
# IMPORTANT AUDIO CATEGORIES
# ============================================================

SEMANTIC_GROUPS = {

    "voice": [
        "Conversation",
        "Narration",
        "Male speech",
        "Female speech",
    ],

    "singing": [
        "Singing",
        "Choir",
        "Vocal music",
    ],

    "music": [
        "Music",
        "Musical instrument",
        "Musical ensemble",
    ],

    "drums": [
        "Drum",
        "Drum kit",
        "Snare drum",
        "Bass drum",
        "Drum roll",
        "Percussion",
    ],

    "bass": [
        "Bass guitar",
        "Double bass",
        "Bass drum",
    ],

    "guitar": [
        "Guitar",
        "Electric guitar",
        "Acoustic guitar",
    ],

    "piano": [
        "Piano",
    ],

    "strings": [
        "Violin",
        "Cello",
        "String section",
        "Strings",
    ],

    "electronic": [
        "Electronic music",
        "House music",
        "Techno",
        "Dubstep",
        "Drum and bass",
    ],

    "ambient": [
        "Ambient music",
        "Background music",
    ],

    "noise": [
        "Noise",
        "White noise",
        "Static",
        "Distortion",
    ],
    "clap": [
    "Clapping",
    "Finger snapping",
    ],

    "impact": [
        "Boom",
        "Thump",
        "Smash",
        "Explosion",
    ],
}


# ============================================================
# MODEL
# ============================================================

class AudioModel:
    """
    Pretrained YAMNet audio understanding model.

    The class exposes a very small interface:

        model.predict(audio)

    which returns semantic probabilities.

    The rest of the Fluid Canvas pipeline doesn't need to know
    anything about TensorFlow or YAMNet.
    """

    def __init__(
        self,
        threshold: float = DEFAULT_THRESHOLD,
    ) -> None:

        self.threshold = threshold

        self.model = None
        self.class_names: list[str] = []

        self.group_indices: dict[str, list[int]] = {}

        self._load_model()

    # --------------------------------------------------------
    # LOAD MODEL
    # --------------------------------------------------------

    def _load_model(self) -> None:
        """
        Load YAMNet once.

        Loading the model for every audio frame would be extremely
        slow and memory inefficient.
        """

        if tf is None or hub is None:
            raise ImportError(
                "\n"
                "TensorFlow/TensorFlow Hub is not installed.\n\n"
                "Install with:\n\n"
                "    pip install tensorflow tensorflow-hub\n"
            )

        print("Loading YAMNet...")

        self.model = hub.load(YAMNET_URL)

        print("YAMNet loaded.")

        self._load_class_names()

        self._build_group_indices()

    # --------------------------------------------------------
    # CLASS NAMES
    # --------------------------------------------------------

    def _load_class_names(self) -> None:
        """
        Load the YAMNet class names.

        The official YAMNet model exposes class-name metadata.
        """

        class_map_path = (
            Path.home()
            / ".cache"
            / "yamnet_class_map.csv"
        )

        if not class_map_path.exists():

            print(
                "Downloading YAMNet class map..."
            )

            self._download_class_map(
                class_map_path
            )

        names: list[str] = []

        with class_map_path.open(
            "r",
            encoding="utf-8",
        ) as file:

            # Skip CSV header.
            next(file, None)

            for line in file:

                parts = line.strip().split(",")

                if len(parts) >= 3:

                    # Class name is the third column.
                    name = ",".join(parts[2:])

                    # Remove quotes if present.
                    name = name.strip().strip('"')

                    names.append(name)

        if not names:
            raise RuntimeError(
                "Could not load YAMNet class names."
            )

        self.class_names = names

        print(
            f"Loaded {len(self.class_names)} "
            "YAMNet classes."
        )

    def _download_class_map(
        self,
        destination: Path,
    ) -> None:
        """
        Download the official YAMNet class map.

        Kept intentionally simple so the class map is stored locally
        after the first execution.
        """

        import urllib.request

        destination.parent.mkdir(
            parents=True,
            exist_ok=True,
        )

        url = (
            "https://raw.githubusercontent.com/"
            "tensorflow/models/master/"
            "research/audioset/yamnet/"
            "yamnet_class_map.csv"
        )

        urllib.request.urlretrieve(
            url,
            destination,
        )

    # --------------------------------------------------------
    # BUILD SEMANTIC GROUPS
    # --------------------------------------------------------

    def _build_group_indices(self) -> None:
        """
        Convert human-readable semantic groups into YAMNet
        class indices.
        """

        self.group_indices = {}

        for group_name, keywords in SEMANTIC_GROUPS.items():

            indices: list[int] = []

            for index, class_name in enumerate(
                self.class_names
            ):

                normalized_class = (
                    class_name.lower()
                )

                for keyword in keywords:

                    if (
                        keyword.lower()
                        in normalized_class
                    ):
                        indices.append(index)
                        break

            # Remove duplicates.
            indices = sorted(set(indices))

            self.group_indices[group_name] = indices

            print(
                f"{group_name:12s}: "
                f"{len(indices)} classes"
            )

    # --------------------------------------------------------
    # PREDICTION
    # --------------------------------------------------------

    def predict(
        self,
        audio: np.ndarray,
        sample_rate: int = 16_000,
    ) -> dict[str, float]:
        """
        Predict semantic audio characteristics.

        Parameters
        ----------
        audio:
            Mono floating-point waveform.

        sample_rate:
            Input sample rate.

        Returns
        -------
        dict
            Semantic probabilities.

        IMPORTANT:
            No temporal smoothing is performed here.
        """

        if self.model is None:
            raise RuntimeError(
                "Audio model has not been loaded."
            )

        # ----------------------------------------------------
        # YAMNet expects 16 kHz mono audio.
        # ----------------------------------------------------

        audio = np.asarray(
            audio,
            dtype=np.float32,
        )

        if sample_rate != 16_000:

            raise ValueError(
                "YAMNet requires 16 kHz audio. "
                f"Received {sample_rate} Hz."
            )

        # ----------------------------------------------------
        # Remove NaN / infinity.
        #
        # This is numerical safety, NOT smoothing.
        # ----------------------------------------------------

        audio = np.nan_to_num(
            audio,
            nan=0.0,
            posinf=0.0,
            neginf=0.0,
        )

        waveform = tf.convert_to_tensor(
            audio,
            dtype=tf.float32,
        )

        # ----------------------------------------------------
        # Run pretrained model.
        #
        # YAMNet returns:
        #
        #   scores
        #   embeddings
        #   spectrogram
        #
        # We use scores here.
        # ----------------------------------------------------

        scores, embeddings, spectrogram = (
            self.model(waveform)
        )

        # YAMNet internally produces multiple predictions
        # for longer input windows.
        #
        # We take the maximum activation across the model's
        # internal frames.
        #
        # It preserves the strongest event detected inside
        # this individual analysis window.
        scores = scores.numpy()

        if scores.ndim == 2:

            class_scores = np.max(
                scores,
                axis=0,
            )

        else:

            class_scores = scores

        # ----------------------------------------------------
        # Convert YAMNet classes into our semantic vocabulary.
        # ----------------------------------------------------

        result: dict[str, float] = {}

        for group_name, indices in (
            self.group_indices.items()
        ):

            if not indices:

                result[group_name] = 0.0
                continue

            group_score = float(
                np.max(
                    class_scores[indices]
                )
            )

            # Keep exact raw model probability.
            result[group_name] = group_score

        return result

    # --------------------------------------------------------
    # RAW CLASS PREDICTIONS
    # --------------------------------------------------------

    def predict_raw(
        self,
        audio: np.ndarray,
        sample_rate: int = 16_000,
        top_k: int = 20,
    ) -> list[dict[str, Any]]:
        """
        Return the strongest raw YAMNet classes.

        Useful during development for discovering what the model
        actually detects in your music.

        This is especially useful before designing visual
        semantic groups.
        """

        audio = np.asarray(
            audio,
            dtype=np.float32,
        )

        waveform = tf.convert_to_tensor(
            audio,
            dtype=tf.float32,
        )

        scores, _, _ = self.model(
            waveform
        )

        scores = scores.numpy()

        if scores.ndim == 2:
            class_scores = np.max(
                scores,
                axis=0,
            )
        else:
            class_scores = scores

        indices = np.argsort(
            class_scores
        )[::-1][:top_k]

        results = []

        for index in indices:

            score = float(
                class_scores[index]
            )

            results.append(
                {
                    "label": self.class_names[index],
                    "score": score,
                }
            )

        return results


# ============================================================
# CLI TEST MODE
# ============================================================

def run_test(
    input_path: Path,
) -> None:
    """
    Run the model on a complete audio file for inspection.

    This is NOT the production extraction pipeline.
    It is simply a convenient debugging tool.
    """

    import librosa

    print()
    print("Loading audio...")

    audio, sample_rate = librosa.load(
        input_path,
        sr=16_000,
        mono=True,
    )

    print(
        f"Duration: {len(audio) / sample_rate:.2f}s"
    )

    model = AudioModel()

    # --------------------------------------------------------
    # Analyze the first ~1 second.
    # --------------------------------------------------------

    test_length = min(
        len(audio),
        sample_rate,
    )

    frame = audio[:test_length]

    print()
    print("Semantic groups:")
    print("----------------")

    semantic = model.predict(
        frame,
        sample_rate,
    )

    for name, value in semantic.items():

        print(
            f"{name:15s} "
            f"{value:.4f}"
        )

    print()
    print("Top raw YAMNet classes:")
    print("-----------------------")

    raw = model.predict_raw(
        frame,
        sample_rate,
        top_k=20,
    )

    for item in raw:

        print(
            f"{item['score']:.4f} "
            f"{item['label']}"
        )


# ============================================================
# JSON EXPORT TEST
# ============================================================

def export_test_json(
    input_path: Path,
    output_path: Path,
) -> None:
    """
    Analyze the first second and write a small JSON file.

    This is intended for verifying that the model integration
    works before connecting it to extract_features.py.
    """

    import librosa

    audio, sample_rate = librosa.load(
        input_path,
        sr=16_000,
        mono=True,
    )

    model = AudioModel()

    frame_length = min(
        sample_rate,
        len(audio),
    )

    frame = audio[:frame_length]

    semantic = model.predict(
        frame,
        sample_rate,
    )

    raw = model.predict_raw(
        frame,
        sample_rate,
    )

    output = {
        "schema_version": "1.0",

        "model": {
            "name": "YAMNet",
            "pretrained": True,
        },

        "analysis": {
            "sample_rate": sample_rate,
            "temporal_smoothing": False,
            "temporal_interpolation": False,
            "rolling_normalization": False,
        },

        "source": {
            "filename": input_path.name,
        },

        "semantic": semantic,

        "top_classes": raw,
    }

    output_path.parent.mkdir(
        parents=True,
        exist_ok=True,
    )

    with output_path.open(
        "w",
        encoding="utf-8",
    ) as file:

        json.dump(
            output,
            file,
            indent=2,
        )

    print()
    print(
        f"Saved test output: {output_path}"
    )


# ============================================================
# MAIN
# ============================================================

def main() -> int:

    parser = argparse.ArgumentParser(
        description=(
            "Fluid Canvas pretrained audio "
            "understanding model."
        )
    )

    parser.add_argument(
        "input",
        type=Path,
        help="Audio file to inspect.",
    )

    parser.add_argument(
        "-o",
        "--output",
        type=Path,
        default=None,
        help="Optional JSON output path.",
    )

    args = parser.parse_args()

    if not args.input.exists():

        print(
            f"ERROR: File not found: {args.input}",
            file=sys.stderr,
        )

        return 1

    try:

        if args.output:

            export_test_json(
                args.input,
                args.output,
            )

        else:

            run_test(
                args.input
            )

        return 0

    except Exception as exc:

        print(
            f"ERROR: {exc}",
            file=sys.stderr,
        )

        return 1


if __name__ == "__main__":
    raise SystemExit(main())
