#!/usr/bin/env bash
set -e

PROCESSED_DIR="data/processed"
TARGETS_DIR="data/targets"
DECIMALS=4

echo "=========================================="
echo "Reducing JSON float precision to ${DECIMALS} decimals"
echo "=========================================="

# Use 'uv run python' to execute the inline Python script safely
uv run python - <<EOF
import json
from pathlib import Path

def round_floats(obj, decimals=$DECIMALS):
    if isinstance(obj, float):
        return round(obj, decimals)
    elif isinstance(obj, dict):
        return {k: round_floats(v, decimals) for k, v in obj.items()}
    elif isinstance(obj, list):
        return [round_floats(x, decimals) for x in obj]
    return obj

dirs = ["$PROCESSED_DIR", "$TARGETS_DIR"]

for d in dirs:
    path = Path(d)
    if not path.exists():
        print(f"Skipping (not found): {path}")
        continue
    
    print(f"\nProcessing directory: {path}")
    for json_file in path.glob("*.json"):
        with open(json_file, "r", encoding="utf-8") as f:
            data = json.load(f)
            
        cleaned_data = round_floats(data, $DECIMALS)
        
        with open(json_file, "w", encoding="utf-8") as f:
            json.dump(cleaned_data, f, indent=2)
            
        print(f"  Rounded: {json_file.name}")

print("\n==========================================")
print("Precision reduction complete!")
print("==========================================")
EOF