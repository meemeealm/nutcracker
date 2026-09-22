#!/usr/bin/env bash

# Exit immediately if a command fails
set -e

echo "Starting filename normalization..."

# Helper function to sanitize a filename string
sanitize_name() {
  local filename="$1"
  # 1. Convert to lowercase
  local name
  name=$(echo "$filename" | tr '[:upper:]' '[:lower:]')
  # 2. Replace non-alphanumeric chars (spaces, hyphens, parentheses, special chars) except dot with underscore
  name=$(echo "$name" | sed -E 's/[^a-z0-9.]/_/g')
  # 3. Collapse multiple consecutive underscores into a single underscore
  name=$(echo "$name" | sed -E 's/_+/_/g')
  # 4. Remove leading underscores before the filename
  name=$(echo "$name" | sed -E 's/^_//')
  echo "$name"
}

# Process MP3 files in current directory
for file in *.mp3; do
  [ -f "$file" ] || continue
  new_name=$(sanitize_name "$file")
  if [ "$file" != "$new_name" ]; then
    echo "Renaming MP3: '$file' -> '$new_name'"
    mv -n "$file" "$new_name"
  fi
done


echo "Done! All files normalized."