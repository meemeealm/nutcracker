#!/usr/bin/env python3
"""Fluid Canvas - Build audio → painting ML dataset."""

from __future__ import annotations

import argparse
import json
import random
from pathlib import Path
from typing import Any

FEATURE_NAMES = [
    "rms",
    "zero_crossing_rate",
    "spectral_centroid",
    "spectral_bandwidth",
    "spectral_rolloff",
]

SEMANTIC_NAMES = [
    "voice", "singing", "music", "drums", "bass",
    "guitar", "piano", "strings", "electronic",
    "ambient", "noise", "clap", "impact",
]

TARGET_NAMES = [
    "flow_strength",
    "turbulence",
    "pigment_spread",
    "displacement",
    "warp",
    "color_shift",
    "detail",
    "activity",
]


def args() -> argparse.Namespace:
    p = argparse.ArgumentParser()
    p.add_argument("--features", type=Path, required=True)
    p.add_argument("--targets", type=Path, required=True)
    p.add_argument("--output", type=Path, required=True)
    p.add_argument("--validation-ratio", type=float, default=0.2)
    p.add_argument("--seed", type=int, default=42)
    return p.parse_args()


def number(value: Any) -> float:
    try:
        return float(value)
    except (TypeError, ValueError):
        return 0.0


def clamp(value: float, lo: float = 0.0, hi: float = 1.0) -> float:
    return max(lo, min(hi, value))


def scale(value: Any, maximum: float) -> float:
    return clamp(number(value) / maximum)


def input_vector(frame: dict[str, Any]) -> list[float]:
    f = frame.get("features", {})
    s = frame.get("semantic", {})

    vector = [
        scale(f.get("rms"), 1.0),
        scale(f.get("zero_crossing_rate"), 1.0),
        scale(f.get("spectral_centroid"), 8000),
        scale(f.get("spectral_bandwidth"), 5000),
        scale(f.get("spectral_rolloff"), 8000),
    ]

    mfcc = f.get("mfcc", [])

    vector.extend(
        clamp(number(x) / 40.0, -1.0, 1.0)
        for x in mfcc
    )

    vector.extend(
        clamp(number(s.get(name, 0.0)))
        for name in SEMANTIC_NAMES
    )

    return vector


def target_vector(frame: dict[str, Any]) -> list[float]:
    t = frame.get("target", {})

    return [
        clamp(number(t.get(name, 0.0)))
        for name in TARGET_NAMES
    ]


def load_frames(path: Path) -> dict[int, dict[str, Any]]:
    with path.open("r", encoding="utf-8") as f:
        data = json.load(f)

    return {
        int(frame["index"]): frame
        for frame in data.get("frames", [])
        if "index" in frame
    }


def build_samples(
    feature_path: Path,
    target_path: Path,
) -> list[dict[str, Any]]:

    features = load_frames(feature_path)
    targets = load_frames(target_path)

    samples = []

    for index in sorted(features.keys() & targets.keys()):
        frame = features[index]

        samples.append({
            "track": feature_path.name,
            "index": index,
            "time": number(frame.get("time")),
            "x": input_vector(frame),
            "y": target_vector(targets[index]),
        })

    return samples


def split_samples(
    samples: list[dict[str, Any]],
    validation_ratio: float,
    seed: int,
) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:

    tracks = sorted({
        sample["track"]
        for sample in samples
    })

    # One track:
    # split by time so development can begin with one song.
    if len(tracks) == 1:
        samples = sorted(
            samples,
            key=lambda x: x["index"],
        )

        split = int(
            len(samples)
            * (1.0 - validation_ratio)
        )

        return (
            samples[:split],
            samples[split:],
        )

    # Multiple tracks:
    # keep complete songs separated.
    rng = random.Random(seed)
    rng.shuffle(tracks)

    validation_count = max(
        1,
        round(len(tracks) * validation_ratio),
    )

    validation_tracks = set(
        tracks[:validation_count]
    )

    train = [
        s for s in samples
        if s["track"] not in validation_tracks
    ]

    validation = [
        s for s in samples
        if s["track"] in validation_tracks
    ]

    return train, validation


def main() -> int:
    a = args()

    if not a.features.exists():
        raise FileNotFoundError(a.features)

    if not a.targets.exists():
        raise FileNotFoundError(a.targets)

    feature_files = sorted(
        a.features.glob("*.json")
    )

    all_samples = []

    for feature_path in feature_files:
        target_path = a.targets / feature_path.name

        if not target_path.exists():
            print(
                f"Skipping {feature_path.name}: "
                "target not found."
            )
            continue

        samples = build_samples(
            feature_path,
            target_path,
        )

        print(
            f"{feature_path.name}: "
            f"{len(samples)} samples"
        )

        all_samples.extend(samples)

    if not all_samples:
        raise RuntimeError(
            "No paired samples found."
        )

    train, validation = split_samples(
        all_samples,
        a.validation_ratio,
        a.seed,
    )

    feature_names = (
        FEATURE_NAMES
        + [f"mfcc_{i}" for i in range(13)]
        + SEMANTIC_NAMES
    )

    dataset = {
        "schema_version": "1.0",
        "project": "fluid-canvas",

        "task": {
            "type": "audio_to_painting_control",
        },

        "features": {
            "names": feature_names,
            "count": len(feature_names),
            "normalization": "fixed_range",
            "temporal_normalization": False,
        },

        "targets": {
            "names": TARGET_NAMES,
            "count": len(TARGET_NAMES),
            "range": [0.0, 1.0],
        },

        "dataset": {
            "tracks": len({
                s["track"] for s in all_samples
            }),
            "total_samples": len(all_samples),
            "train_samples": len(train),
            "validation_samples": len(validation),
            "split": (
                "temporal"
                if len({
                    s["track"] for s in all_samples
                }) == 1
                else "track_level"
            ),
            "validation_ratio": a.validation_ratio,
            "seed": a.seed,
            "temporal_smoothing": False,
            "temporal_interpolation": False,
        },

        "train": train,
        "validation": validation,
    }

    a.output.parent.mkdir(
        parents=True,
        exist_ok=True,
    )

    with a.output.open(
        "w",
        encoding="utf-8",
    ) as f:
        json.dump(
            dataset,
            f,
            indent=2,
        )

    print()
    print("Dataset created.")
    print(f"Tracks:      {dataset['dataset']['tracks']}")
    print(f"Total:       {len(all_samples)}")
    print(f"Training:    {len(train)}")
    print(f"Validation:  {len(validation)}")
    print(f"Input size:  {len(feature_names)}")
    print(f"Output size: {len(TARGET_NAMES)}")
    print(f"Saved:       {a.output}")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
