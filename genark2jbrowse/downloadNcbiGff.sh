#!/bin/bash

set -euo pipefail

source "$(dirname "$0")/common.sh"

# NCBI assembly URLs are versioned and immutable, so a new annotation or
# assembly normally arrives as a new accession (new filename) and is picked up
# automatically. By default we therefore only fetch files we don't already
# have. Set FETCH_UPDATES=1 to instead revalidate every file with a conditional
# request (wget -N), which re-pulls in-place re-annotations published at the
# same URL. This is the replacement for rsync, which NCBI retired 2026-06-01.
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

  # With FETCH_UPDATES, queue everything and let wget -N decide per file;
  # otherwise only queue files we don't already have.
  if [ -n "${FETCH_UPDATES:-}" ] || [ ! -f "gff/$filename" ]; then
    # Output: url|common_name|filename
    echo "$url|$common_name|$filename"
  fi
}

export -f check_and_queue

# Extract NCBI GFF URLs from processed JSON
# Filter out null entries and null ncbiGff before using test()
QUEUE_FILE=$(mktemp)
jq -r '.[] | select(. != null) | select(.ncbiGff != null) | select(.ncbiGff | test("GCF_")) | "\(.ncbiGff)\t\(.commonName)"' processedHubJson/all.json |
  parallel $PARALLEL_OPTS --colsep $'\t' check_and_queue {} >"$QUEUE_FILE"

# Count how many files need downloading
TOTAL=$(wc -l <"$QUEUE_FILE")

if [ "$TOTAL" -eq 0 ]; then
  echo "No GFF files need downloading"
  rm "$QUEUE_FILE"
  exit 0
fi

if [ -n "${FETCH_UPDATES:-}" ]; then
  echo "Phase 2: Revalidating $TOTAL GFF files for updates (rate-limited)..."
else
  echo "Phase 2: Downloading $TOTAL GFF files (rate-limited)..."
fi

# Define function to download a single NCBI GFF file
download_ncbi_gff() {
  local line="$1"
  local url
  url=$(echo "$line" | cut -d'|' -f1)
  local common_name
  common_name=$(echo "$line" | cut -d'|' -f2)
  local filename
  filename=$(echo "$line" | cut -d'|' -f3)

  # -nc never re-downloads an existing file; -N (timestamping) re-downloads
  # only when the remote Last-Modified is newer than the local copy. They are
  # mutually exclusive, so pick one based on FETCH_UPDATES.
  local wget_mode=-nc
  if [ -n "${FETCH_UPDATES:-}" ]; then
    wget_mode=-N
  fi

  echo "Fetching GFF file for $common_name: $url"
  if wget "$wget_mode" -q "$url" -P gff; then
    echo "OK $common_name: $filename"
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
