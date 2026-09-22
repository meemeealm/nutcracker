#!/usr/bin/env python3
"""Export Keras model to TensorFlow.js."""

from __future__ import annotations

import argparse
import json
import shutil
import subprocess
import sys
from pathlib import Path

import tensorflow as tf


def parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser()
    p.add_argument("--model", type=Path, required=True)
    p.add_argument("--metadata", type=Path, required=True)
    p.add_argument("--output", type=Path, required=True)
    return p.parse_args()


def main() -> int:
    a = parse_args()

    if not a.model.exists():
        raise FileNotFoundError(a.model)

    print(f"Loading: {a.model}")
    model = tf.keras.models.load_model(a.model)

    saved_model = a.output.parent / "_saved_model"

    if saved_model.exists():
        shutil.rmtree(saved_model)

    a.output.mkdir(parents=True, exist_ok=True)

    print("Exporting SavedModel...")

    tf.saved_model.save(
        model,
        saved_model,
    )

    print("Converting to TensorFlow.js...")

    metadata = {}

    if a.metadata.exists():
        with a.metadata.open("r", encoding="utf-8") as f:
            metadata = json.load(f)

    metadata["browser"] = {
        "format": "tensorflowjs_graph_model",
        "model_file": "model.json",
    }

    with (a.output / "metadata.json").open(
        "w",
        encoding="utf-8",
    ) as f:
        json.dump(metadata, f, indent=2)

    shutil.rmtree(saved_model)

    print()
    print("Browser model ready:")
    print(a.output / "model.json")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
