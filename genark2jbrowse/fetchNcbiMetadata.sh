#!/bin/bash

source "$(dirname "$0")/common.sh"

echo "Phase 1: Building queue of assemblies that need NCBI metadata..."

# Define function to check if an assembly needs fetching and add to queue
check_and_queue() {
  local file="$1"
  local dir="${file%/meta.json}"
  local id="${dir##*/}"
  local ncbi_file="$dir/ncbi.json"

  if [ ! -f "$ncbi_file" ] || [ ! -s "$ncbi_file" ] || [ -n "$REPROCESS" ]; then
    # Output: dir|id|common_name
    local common_name=$(jq -r '.commonName // "Unknown"' "$file" 2>/dev/null || echo "Unknown")
    echo "$dir|$id|$common_name"
  fi
}

export -f check_and_queue

# Build the queue in parallel (fast I/O operations)
QUEUE_FILE=$(mktemp)
fd meta.json hubs | parallel $PARALLEL_OPTS check_and_queue {} > "$QUEUE_FILE"

# Count how many assemblies need fetching
TOTAL=$(wc -l < "$QUEUE_FILE")

if [ "$TOTAL" -eq 0 ]; then
  echo "No assemblies need NCBI metadata fetching"
  rm "$QUEUE_FILE"
  exit 0
fi

echo "Phase 2: Fetching NCBI metadata for $TOTAL assemblies (rate-limited)..."

# Define function to fetch NCBI data (called serially with rate limiting)
fetch_ncbi_data() {
  local line="$1"
  local dir=$(echo "$line" | cut -d'|' -f1)
  local id=$(echo "$line" | cut -d'|' -f2)
  local common_name=$(echo "$line" | cut -d'|' -f3)
  local ncbi_file="$dir/ncbi.json"

  echo "Fetching NCBI data for $id ($common_name)"

  # Use esearch and esummary to get assembly metadata and save as ncbi.json
  (esearch -db assembly -query "$id" </dev/null | esummary -mode json) >"$ncbi_file"

  # Small delay to avoid overwhelming the NCBI E-utilities
  sleep 0.1
}

export -f fetch_ncbi_data

# Process the queue serially with rate limiting
# Use :::: to read from file for better --bar support
parallel -j1 $PARALLEL_OPTS fetch_ncbi_data :::: "$QUEUE_FILE"

# Clean up
rm "$QUEUE_FILE"

echo "NCBI metadata fetching complete"
