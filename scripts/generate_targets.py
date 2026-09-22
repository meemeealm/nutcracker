#!/usr/bin/env python3

"""
Fluid Canvas
Generate painting targets from audio feature JSON.

Input:
    data/processed/*.json

Output:
    data/targets/*.json

The generated targets describe HOW the painting should react
to the sound. They are not pixels.

No temporal smoothing is used.
Each audio frame produces an independent visual target.

Usage:

    uv run python training/generate_targets.py \
        --input public/ml \
        --output data/targets
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path
from typing import Any


# ============================================================
# CONFIGURATION
# ============================================================

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


# ============================================================
# HELPERS
# ============================================================

def clamp(value: float, minimum: float = 0.0, maximum: float = 1.0) -> float:
    return max(minimum, min(maximum, value))


def safe_float(value: Any) -> float:
    try:
        return float(value)
    except (TypeError, ValueError):
        return 0.0


def get_feature(
    features: dict[str, Any],
    name: str,
) -> float:
    return safe_float(features.get(name, 0.0))


def get_semantic(
    semantic: dict[str, Any],
    name: str,
) -> float:
    return safe_float(semantic.get(name, 0.0))


# ============================================================
# NORMALIZED AUDIO FEATURES
# ============================================================

def normalize_centroid(value: float) -> float:
    """
    Spectral centroid from approximately 0 Hz to 8 kHz.

    The exact range is intentionally conservative for music.
    """

    return clamp(value / 8000.0)


def normalize_bandwidth(value: float) -> float:
    return clamp(value / 5000.0)


def normalize_rolloff(value: float) -> float:
    return clamp(value / 8000.0)


def mfcc_activity(mfcc: list[Any]) -> float:
    """
    Estimate timbral activity from MFCC magnitude.

    This is NOT temporal smoothing.
    It only examines the current frame.
    """

    if not mfcc:
        return 0.0

    values = [
        abs(safe_float(x))
        for x in mfcc[1:]
    ]

    if not values:
        return 0.0

    # Typical MFCC magnitudes can be much larger than 1.
    # Compress them into a useful 0..1 range.
    mean_abs = sum(values) / len(values)

    return clamp(mean_abs / 40.0)


# ============================================================
# TARGET GENERATION
# ============================================================

def generate_target(frame: dict[str, Any]) -> dict[str, float]:
    """
    Convert one audio frame into painting controls.

    This is an initial artistic mapping.

    The neural network will eventually learn this mapping from
    training data rather than relying entirely on these formulas.
    """

    features = frame.get(
        "features",
        {},
    )

    semantic = frame.get(
        "semantic",
        {},
    )

    # --------------------------------------------------------
    # Raw acoustic features
    # --------------------------------------------------------

    rms = clamp(
        get_feature(features, "rms")
    )

    centroid = normalize_centroid(
        get_feature(
            features,
            "spectral_centroid",
        )
    )

    bandwidth = normalize_bandwidth(
        get_feature(
            features,
            "spectral_bandwidth",
        )
    )

    rolloff = normalize_rolloff(
        get_feature(
            features,
            "spectral_rolloff",
        )
    )

    mfcc = features.get(
        "mfcc",
        [],
    )

    timbre = mfcc_activity(
        mfcc
    )

    # --------------------------------------------------------
    # Semantic audio features
    # --------------------------------------------------------

    music = get_semantic(
        semantic,
        "music",
    )

    voice = get_semantic(
        semantic,
        "voice",
    )

    singing = get_semantic(
        semantic,
        "singing",
    )

    drums = get_semantic(
        semantic,
        "drums",
    )

    bass = get_semantic(
        semantic,
        "bass",
    )

    guitar = get_semantic(
        semantic,
        "guitar",
    )

    piano = get_semantic(
        semantic,
        "piano",
    )

    strings = get_semantic(
        semantic,
        "strings",
    )

    electronic = get_semantic(
        semantic,
        "electronic",
    )

    ambient = get_semantic(
        semantic,
        "ambient",
    )

    noise = get_semantic(
        semantic,
        "noise",
    )

    clap = get_semantic(
        semantic,
        "clap",
    )

    impact = get_semantic(
        semantic,
        "impact",
    )

    # ========================================================
    # PAINTING BEHAVIOR
    # ========================================================

    # Large-scale movement.
    flow_strength = clamp(
        0.30 * rms
        + 0.25 * bass
        + 0.15 * music
        + 0.15 * ambient
        + 0.15 * singing
    )

    # Short, aggressive motion.
    turbulence = clamp(
        0.30 * drums
        + 0.20 * impact
        + 0.15 * electronic
        + 0.15 * clap
        + 0.10 * rms
        + 0.10 * noise
    )

    # How quickly pigment spreads through the fluid.
    pigment_spread = clamp(
        0.30 * rms
        + 0.20 * bass
        + 0.20 * flow_strength
        + 0.15 * ambient
        + 0.15 * music
    )

    # 3D surface displacement.
    displacement = clamp(
        0.40 * rms
        + 0.20 * bass
        + 0.15 * drums
        + 0.10 * impact
        + 0.15 * timbre
    )

    # UV/domain deformation.
    warp = clamp(
        0.25 * centroid
        + 0.20 * bandwidth
        + 0.20 * timbre
        + 0.15 * electronic
        + 0.10 * singing
        + 0.10 * noise
    )

    # Color movement.
    color_shift = clamp(
        0.25 * centroid
        + 0.20 * singing
        + 0.15 * voice
        + 0.15 * electronic
        + 0.15 * timbre
        + 0.10 * strings
    )

    # Fine visual detail.
    detail = clamp(
        0.25 * centroid
        + 0.20 * bandwidth
        + 0.20 * timbre
        + 0.15 * guitar
        + 0.10 * piano
        + 0.10 * strings
    )

    # Overall visual activity.
    activity = clamp(
        0.30 * rms
        + 0.15 * drums
        + 0.15 * bass
        + 0.10 * singing
        + 0.10 * electronic
        + 0.10 * centroid
        + 0.10 * timbre
    )

    return {
        "flow_strength": flow_strength,
        "turbulence": turbulence,
        "pigment_spread": pigment_spread,
        "displacement": displacement,
        "warp": warp,
        "color_shift": color_shift,
        "detail": detail,
        "activity": activity,
    }


# ============================================================
# PROCESS ONE FILE
# ============================================================

def process_file(
    input_path: Path,
    output_path: Path,
) -> None:

    print(f"Processing: {input_path.name}")

    with input_path.open(
        "r",
        encoding="utf-8",
    ) as file:

        source = json.load(file)

    source_frames = source.get(
        "frames",
        [],
    )

    output_frames = []

    for frame in source_frames:

        target = generate_target(
            frame
        )

        output_frames.append(
            {
                "index": frame.get(
                    "index",
                    len(output_frames),
                ),

                "time": frame.get(
                    "time",
                    0.0,
                ),

                "target": target,
            }
        )

    output = {
        "schema_version": "1.0",

        "source": source.get(
            "source",
            {
                "filename": input_path.name
            },
        ),

        "target_type": "painting_controls",

        "target_names": TARGET_NAMES,

        "generation": {
            "temporal_smoothing": False,
            "temporal_interpolation": False,
            "rolling_normalization": False,
            "method": "rule_based_initial_targets",
        },

        "frames": output_frames,
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

    print(
        f"  frames: {len(output_frames)}"
    )

    print(
        f"  saved:  {output_path}"
    )


# ============================================================
# MAIN
# ============================================================

def main() -> int:

    parser = argparse.ArgumentParser(
        description=(
            "Generate initial painting targets "
            "from Fluid Canvas audio JSON."
        )
    )

    parser.add_argument(
        "--input",
        type=Path,
        required=True,
        help="Directory containing audio feature JSON files.",
    )

    parser.add_argument(
        "--output",
        type=Path,
        required=True,
        help="Directory for generated target JSON files.",
    )

    args = parser.parse_args()

    if not args.input.exists():

        raise FileNotFoundError(
            f"Input directory does not exist: {args.input}"
        )

    args.output.mkdir(
        parents=True,
        exist_ok=True,
    )

    files = sorted(
        args.input.glob("*.json")
    )

    if not files:

        print(
            f"No JSON files found in {args.input}"
        )

        return 0

    for input_path in files:

        output_path = (
            args.output
            / input_path.name
        )

        process_file(
            input_path,
            output_path,
        )

    print()
    print(
        f"Completed {len(files)} file(s)."
    )

    return 0


if __name__ == "__main__":
    raise SystemExit(
        main()
    )
