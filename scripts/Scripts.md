# ML Training & Audio ETL Pipeline

## Overview

```text
training/
├── audio_model.py         # YAMNet model wrapper for semantic audio classification
├── extract_features.py    # Extracts librosa acoustic features + YAMNet semantic tags
├── generate_targets.py    # Maps extracted features into 8 visual painting parameters
└── run_etl.sh             # Automated Bash script to run the full pipeline song-by-song

```

### 1. `audio_model.py`

* **Purpose:** Wraps the pretrained **YAMNet** model from TensorFlow Hub.
* **Functionality:** Downloads and caches the YAMNet class map, categorizes audio frames into semantic groups (e.g., `voice`, `drums`, `bass`, `guitar`, `electronic`), and generates confidence scores.

### 2. `extract_features.py`

* **Purpose:** Core feature extraction script.
* **Functionality:** Loads audio at a standard 16 kHz sample rate, slices it into 0.10s hops, computes low-level features (`rms`, `zero_crossing_rate`, `spectral_centroid`, `spectral_bandwidth`, `spectral_rolloff`, and 13 MFCCs), merges them with YAMNet semantic predictions, and outputs a unified feature JSON.

### 3. `generate_targets.py`

* **Purpose:** Artistic mapping engine.
* **Functionality:** Takes the processed feature JSON and applies rule-based formulas to transform audio properties into 8 independent visual control signals:
* `flow_strength` (Large-scale movement)
* `turbulence` (Short, aggressive motion)
* `pigment_spread` (Diffusion through fluid)
* `displacement` (3D surface changes)
* `warp` (UV/domain deformation)
* `color_shift` (Color movement)
* `detail` (Fine visual details)
* `activity` (Overall visual intensity)



### 4. `run_etl.sh`

* **Purpose:** Automated batch execution script.
* **Functionality:** Iterates through raw MP3 files one-by-one, running feature extraction and target generation sequentially to produce clean, synchronized output files.



### 4. `clean_json.sh`
* **Purpose:** Truncate decimal points in json files.
* **Functionality:** Reduce the 10+ decimal points to 4 decimals in json files.



### 4. `normalize.sh`
* **Purpose:** Normalize the .mp3 file names.
* **Functionality:** Lower the capital letters, and add _ between the spaces.


---

## Prerequisites

* `librosa`
* `numpy`
* `tensorflow`
* `tensorflow-hub`

---

### Manual Execution (Single Song)

```bash
# Step 1: Extract features
uv run python training/extract_features.py data/raw/audio/song.mp3 --output data/processed/song_features.json

# Step 2: Generate painting targets
uv run python training/generate_targets.py --input data/processed --output data/targets

```

Note: build_dataset.py and export_model.py are for training only.