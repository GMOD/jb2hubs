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

echo "Phase 2: Fetching NCBI metadata for $TOTAL assemblies using datasets CLI..."

# Extract accessions and build a lookup from accession -> dir
ACCESSION_FILE=$(mktemp)
cut -d'|' -f2 "$QUEUE_FILE" > "$ACCESSION_FILE"

# Create a temp dir for per-accession results
RESULT_DIR=$(mktemp -d)

# Fetch in batches of 200 accessions
BATCH_SIZE=200
split -l "$BATCH_SIZE" -d "$ACCESSION_FILE" "${ACCESSION_FILE}_batch_"

for batch_file in "${ACCESSION_FILE}_batch_"*; do
  batch_count=$(wc -l < "$batch_file")
  echo "Fetching batch: $batch_count accessions..."

  batch_result=$(mktemp)
  datasets summary genome accession --inputfile "$batch_file" > "$batch_result" 2>/dev/null

  # Split the batch result into per-accession files
  jq -c '.reports[]' "$batch_result" | while read -r report; do
    acc=$(echo "$report" | jq -r '.accession')
    paired=$(echo "$report" | jq -r '.paired_accession // empty')
    current=$(echo "$report" | jq -r '.current_accession // empty')
    wrapped=$(echo "$report" | jq -c '{reports: [.], total_count: 1}')

    echo "$wrapped" > "$RESULT_DIR/$acc.json"
    if [ -n "$paired" ] && [ "$paired" != "$acc" ]; then
      echo "$wrapped" > "$RESULT_DIR/$paired.json"
    fi
    if [ -n "$current" ] && [ "$current" != "$acc" ] && [ "$current" != "$paired" ]; then
      echo "$wrapped" > "$RESULT_DIR/$current.json"
    fi
  done

  rm "$batch_file" "$batch_result"
done

# Copy results to the correct hub directories
while IFS='|' read -r dir id common_name; do
  ncbi_file="$dir/ncbi.json"
  if [ -f "$RESULT_DIR/$id.json" ]; then
    cp "$RESULT_DIR/$id.json" "$ncbi_file"
    echo "Saved NCBI data for $id ($common_name)"
  else
    echo "Warning: No datasets result for $id ($common_name)"
  fi
done < "$QUEUE_FILE"

# Clean up
rm -f "$QUEUE_FILE" "$ACCESSION_FILE"
rm -rf "$RESULT_DIR"

echo "NCBI metadata fetching complete"
