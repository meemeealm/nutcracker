#!/usr/bin/env python3
"""Fluid Canvas - Train small audio → painting neural network."""

from __future__ import annotations

import argparse
import json
from pathlib import Path

import numpy as np
import tensorflow as tf


# ============================================================
# CONFIG
# ============================================================

DEFAULT_EPOCHS = 80
DEFAULT_BATCH_SIZE = 32
DEFAULT_LEARNING_RATE = 0.001
DEFAULT_HIDDEN_SIZE = 64
DEFAULT_SEED = 42


# ============================================================
# ARGUMENTS
# ============================================================

def parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser()
    p.add_argument("--dataset", type=Path, required=True)
    p.add_argument("--output", type=Path, default=Path("public/ml/model"))
    p.add_argument("--epochs", type=int, default=DEFAULT_EPOCHS)
    p.add_argument("--batch-size", type=int, default=DEFAULT_BATCH_SIZE)
    p.add_argument("--hidden-size", type=int, default=DEFAULT_HIDDEN_SIZE)
    p.add_argument("--learning-rate", type=float, default=DEFAULT_LEARNING_RATE)
    p.add_argument("--seed", type=int, default=DEFAULT_SEED)
    return p.parse_args()


# ============================================================
# LOAD DATA
# ============================================================

def load_dataset(path: Path):
    with path.open("r", encoding="utf-8") as f:
        data = json.load(f)

    train = data["train"]
    validation = data["validation"]

    x_train = np.asarray(
        [sample["x"] for sample in train],
        dtype=np.float32,
    )

    y_train = np.asarray(
        [sample["y"] for sample in train],
        dtype=np.float32,
    )

    x_val = np.asarray(
        [sample["x"] for sample in validation],
        dtype=np.float32,
    )

    y_val = np.asarray(
        [sample["y"] for sample in validation],
        dtype=np.float32,
    )

    if not len(x_train):
        raise RuntimeError("Training dataset is empty.")

    if not len(x_val):
        raise RuntimeError("Validation dataset is empty.")

    return data, x_train, y_train, x_val, y_val


# ============================================================
# MODEL
# ============================================================

def build_model(
    input_size: int,
    output_size: int,
    hidden_size: int,
    learning_rate: float,
) -> tf.keras.Model:

    model = tf.keras.Sequential([
        tf.keras.layers.Input(
            shape=(input_size,),
            name="audio_features",
        ),

        tf.keras.layers.Dense(
            hidden_size,
            activation="relu",
            name="audio_embedding",
        ),

        tf.keras.layers.Dense(
            hidden_size,
            activation="relu",
            name="visual_mapping",
        ),

        tf.keras.layers.Dense(
            output_size,
            activation="sigmoid",
            name="painting_controls",
        ),
    ])

    model.compile(
        optimizer=tf.keras.optimizers.Adam(
            learning_rate=learning_rate,
        ),
        loss="mse",
        metrics=["mae"],
    )

    return model


# ============================================================
# TRAIN
# ============================================================

def train(
    model: tf.keras.Model,
    x_train: np.ndarray,
    y_train: np.ndarray,
    x_val: np.ndarray,
    y_val: np.ndarray,
    epochs: int,
    batch_size: int,
):
    callbacks = [
        tf.keras.callbacks.EarlyStopping(
            monitor="val_loss",
            patience=10,
            restore_best_weights=True,
        ),
        tf.keras.callbacks.ReduceLROnPlateau(
            monitor="val_loss",
            factor=0.5,
            patience=5,
            min_lr=1e-6,
        ),
    ]

    return model.fit(
        x_train,
        y_train,
        validation_data=(x_val, y_val),
        epochs=epochs,
        batch_size=batch_size,
        shuffle=True,
        callbacks=callbacks,
        verbose=1,
    )


# ============================================================
# SAVE
# ============================================================

def save_model(
    model: tf.keras.Model,
    output: Path,
    dataset: dict,
    history: tf.keras.callbacks.History,
) -> None:

    output.parent.mkdir(
        parents=True,
        exist_ok=True,
    )

    model_path = output.with_suffix(".keras")
    metadata_path = output.with_suffix(".json")

    model.save(model_path)

    metadata = {
        "schema_version": "1.0",
        "project": "fluid-canvas",

        "model": {
            "type": "dense_neural_network",
            "framework": "tensorflow",
            "input_size": len(
                dataset["features"]["names"]
            ),
            "output_size": len(
                dataset["targets"]["names"]
            ),
            "hidden_layers": [64, 64],
            "activation": "relu",
            "output_activation": "sigmoid",
        },

        "features": dataset["features"],

        "targets": dataset["targets"],

        "training": {
            "epochs_completed": len(
                history.history["loss"]
            ),
            "final_loss": float(
                history.history["loss"][-1]
            ),
            "final_validation_loss": float(
                history.history["val_loss"][-1]
            ),
        },

        "inference": {
            "temporal_smoothing": False,
            "temporal_interpolation": False,
        },
    }

    with metadata_path.open(
        "w",
        encoding="utf-8",
    ) as f:
        json.dump(
            metadata,
            f,
            indent=2,
        )

    print()
    print(f"Model:    {model_path}")
    print(f"Metadata: {metadata_path}")


# ============================================================
# MAIN
# ============================================================

def main() -> int:
    args = parse_args()

    np.random.seed(args.seed)
    tf.random.set_seed(args.seed)

    print("Loading dataset...")

    dataset, x_train, y_train, x_val, y_val = load_dataset(
        args.dataset
    )

    input_size = x_train.shape[1]
    output_size = y_train.shape[1]

    print(f"Training samples:   {len(x_train)}")
    print(f"Validation samples: {len(x_val)}")
    print(f"Input features:     {input_size}")
    print(f"Painting outputs:   {output_size}")

    model = build_model(
        input_size=input_size,
        output_size=output_size,
        hidden_size=args.hidden_size,
        learning_rate=args.learning_rate,
    )

    model.summary()

    history = train(
        model=model,
        x_train=x_train,
        y_train=y_train,
        x_val=x_val,
        y_val=y_val,
        epochs=args.epochs,
        batch_size=args.batch_size,
    )

    save_model(
        model=model,
        output=args.output,
        dataset=dataset,
        history=history,
    )

    print()
    print("Training complete.")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
