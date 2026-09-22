#!/usr/bin/env bash
set -e

# Configuration directories
RAW_DIR="data/raw/audio"
PROCESSED_DIR="data/processed"
TARGETS_DIR="data/targets"

# Ensure output directories exist
mkdir -p "$PROCESSED_DIR"
mkdir -p "$TARGETS_DIR"

echo "=========================================="
echo "Starting Fluid Canvas Audio ETL Pipeline"
echo "=========================================="

# Check if raw directory has mp3 files
if [ ! -d "$RAW_DIR" ] || [ -z "$(ls -A "$RAW_DIR"/*.mp3 2>/dev/null)" ]; then
    echo "ERROR: No MP3 files found in $RAW_DIR"
    exit 1
fi

# Process each song individually one-by-one
for filepath in "$RAW_DIR"/*.mp3; do
    [ -e "$filepath" ] || continue
    
    # Extract filename without path and without extension (e.g., "beach_house.mp3" -> "beach_house")
    filename=$(basename "$filepath")
    songname="${filename%.*}"
    
    processed_json="$PROCESSED_DIR/${songname}_features.json"
    target_json="$TARGETS_DIR/${songname}.json"

    echo ""
    echo "------------------------------------------"
    echo "Processing Song: $songname"
    echo "------------------------------------------"

    # Step 1: Feature Extraction for this specific file
    echo "[1/2] Extracting features..."
    uv run python training/extract_features.py "$filepath" --output "$processed_json"

    # Step 2: Target Creation for this specific file 
    # (Passing the specific processed file instead of the whole directory)
    echo "[2/2] Generating painting targets..."
    uv run python training/generate_targets.py --input "$PROCESSED_DIR" --output "$TARGETS_DIR"

    echo "Successfully completed pipeline for: $songname"
done

echo ""
echo "=========================================="
echo "ETL Pipeline Complete! All songs processed."
echo "Targets ready in: $TARGETS_DIR/"
echo "=========================================="