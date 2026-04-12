#!/bin/bash

set -euo pipefail

source "$(dirname "$0")/common.sh"

echo "Phase 1: Building queue of GFF files to download..."

# Define function to check if a GFF file needs downloading
check_and_queue() {
  local line="$1"
  local url
  url=$(echo "$line" | cut -f1)
  local common_name
  common_name=$(echo "$line" | cut -f2)
  local filename
  filename=$(basename "$url")

  if [ ! -f "gff/$filename" ]; then
    # Output: url|common_name|filename
    echo "$url|$common_name|$filename"
  fi
}

export -f check_and_queue

# Extract NCBI GFF URLs from processed JSON
# Filter out null entries and null ncbiGff before using test()
QUEUE_FILE=$(mktemp)
jq -r '.[] | select(. != null) | select(.ncbiGff != null) | select(.ncbiGff | test("GCF_")) | "\(.ncbiGff)\t\(.commonName)"' processedHubJson/all.json |
  parallel $PARALLEL_OPTS --colsep $'\t' check_and_queue {} > "$QUEUE_FILE"

# Count how many files need downloading
TOTAL=$(wc -l < "$QUEUE_FILE")

if [ "$TOTAL" -eq 0 ]; then
  echo "No GFF files need downloading"
  rm "$QUEUE_FILE"
  exit 0
fi

echo "Phase 2: Downloading $TOTAL GFF files (rate-limited)..."

# Define function to download a single NCBI GFF file
download_ncbi_gff() {
  local line="$1"
  local url
  url=$(echo "$line" | cut -d'|' -f1)
  local common_name
  common_name=$(echo "$line" | cut -d'|' -f2)
  local filename
  filename=$(echo "$line" | cut -d'|' -f3)

  echo "Downloading GFF file for $common_name: $url"
  if wget -nc -q "$url" -P gff; then
    echo "Successfully downloaded $common_name: $filename"
  else
    echo "Failed to download $common_name: $url" >&2
  fi
}

export -f download_ncbi_gff

# Process the queue serially to avoid overwhelming FTP servers
# Use :::: to read from file for better --bar support
parallel -j1 $PARALLEL_OPTS download_ncbi_gff :::: "$QUEUE_FILE"

# Clean up
rm "$QUEUE_FILE"

echo "GFF download complete"
