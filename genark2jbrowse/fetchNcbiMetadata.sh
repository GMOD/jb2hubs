#!/bin/bash

set -euo pipefail

source "$(dirname "$0")/common.sh"

echo "Phase 1: Building queue of assemblies that need NCBI metadata..."

# buildNcbiQueue.ts queues: assemblies with no ncbi.json yet (new hubs), plus a
# bounded, oldest-first slice of already-fetched assemblies whose metadata has
# aged out. With REPROCESS set it queues everything. The age-based trickle is
# what lets ordinary runs pick up upstream NCBI changes without --reprocess-all.
# Build the queue in a single Node process (avoids 50k+ shell/jq spawns)
QUEUE_FILE=$(mktemp)
DATASETS_ERR=$(mktemp)
cleanup() { rm -f "$QUEUE_FILE" "$DATASETS_ERR"; }
trap cleanup EXIT

fd '^meta\.json$' hubs | node src/buildNcbiQueue.ts >"$QUEUE_FILE"

# Count how many assemblies need fetching
TOTAL=$(wc -l <"$QUEUE_FILE")

if [ "$TOTAL" -eq 0 ]; then
  echo "No assemblies need NCBI metadata fetching"
  rm "$QUEUE_FILE"
  exit 0
fi

echo "Phase 2: Fetching NCBI metadata for $TOTAL assemblies using datasets CLI..."

# Extract accessions
ACCESSION_FILE=$(mktemp)
cut -d'|' -f2 "$QUEUE_FILE" >"$ACCESSION_FILE"

# Create a temp dir for per-accession results
RESULT_DIR=$(mktemp -d)

# Process a batch result JSON: split into per-accession files in RESULT_DIR.
# One jq call produces all output; awk splits it into files (no per-report subprocesses).
process_batch_result() {
  local batch_result="$1"
  # jq outputs pairs of lines: first line is the filename, second is the JSON data
  jq -r '.reports[] |
    {reports: [.], total_count: 1} as $wrapped |
    .accession as $acc |
    ($wrapped | tostring) as $json |
    "\($acc)\n\($json)"
  ' "$batch_result" | awk -v dir="$RESULT_DIR" 'NR%2==1 {filename=$0; next} {f=dir "/" filename ".json"; print > f; close(f)}'
}

# Try a batch request with retries. Returns 0 on success, 1 on failure.
fetch_batch() {
  local batch_file="$1"
  local batch_result
  batch_result=$(mktemp)
  local max_attempts=3

  for attempt in $(seq 1 $max_attempts); do
    if datasets summary genome accession --inputfile "$batch_file" >"$batch_result" 2>"$DATASETS_ERR"; then
      # Valid response: either has .reports array, or has total_count:0 (no results)
      if jq -e '.total_count' "$batch_result" >/dev/null 2>&1; then
        if jq -e '.reports' "$batch_result" >/dev/null 2>&1; then
          process_batch_result "$batch_result"
        fi
        rm -f "$batch_result"
        return 0
      fi
    fi

    local delay=$((attempt * 5))
    echo "  Batch attempt $attempt/$max_attempts failed ($(grep -v 'New version' "$DATASETS_ERR" 2>/dev/null | head -1)), retrying in ${delay}s..."
    sleep "$delay"
  done

  rm -f "$batch_result"
  return 1
}

# Fetch in batches of 1000 — polite to NCBI while keeping request count reasonable.
# At ~50k accessions this is ~50 requests with 5s pauses between them.
BATCH_SIZE=1000
FAILED_FILE=$(mktemp)
split -l "$BATCH_SIZE" -d "$ACCESSION_FILE" "${ACCESSION_FILE}_batch_"

batch_num=0
batch_files=("${ACCESSION_FILE}_batch_"*)
total_batches=${#batch_files[@]}

for batch_file in "${batch_files[@]}"; do
  batch_num=$((batch_num + 1))
  batch_count=$(wc -l <"$batch_file")
  echo "Fetching batch $batch_num/$total_batches ($batch_count accessions)..."

  if ! fetch_batch "$batch_file"; then
    echo "  Batch $batch_num failed after retries, saving accessions for individual retry"
    cat "$batch_file" >>"$FAILED_FILE"
  fi

  rm -f "$batch_file"

  # Polite delay between batches
  if [ "$batch_num" -lt "$total_batches" ]; then
    echo "  Waiting 5s before next batch..."
    sleep 5
  fi
done

# Retry failed batches in smaller groups
if [ -s "$FAILED_FILE" ]; then
  failed_count=$(wc -l <"$FAILED_FILE")
  echo ""
  echo "Phase 2b: Retrying $failed_count accessions from failed batches in smaller groups..."

  split -l 500 -d "$FAILED_FILE" "${FAILED_FILE}_retry_"

  for retry_batch in "${FAILED_FILE}_retry_"*; do
    retry_count=$(wc -l <"$retry_batch")
    echo "  Retrying batch of $retry_count accessions..."

    retry_result=$(mktemp)
    if datasets summary genome accession --inputfile "$retry_batch" >"$retry_result" 2>/dev/null; then
      if jq -e '.reports' "$retry_result" >/dev/null 2>&1; then
        process_batch_result "$retry_result"
      fi
    fi
    rm -f "$retry_result" "$retry_batch"
    sleep 2
  done
fi

# Copy results to the correct hub directories and track what's missing
found=0
not_found=0
while IFS='|' read -r dir id common_name; do
  ncbi_file="$dir/ncbi.json"
  if [ -f "$RESULT_DIR/$id.json" ]; then
    jq --argjson ts "$(date +%s)" '. + {downloaded_at: $ts}' "$RESULT_DIR/$id.json" >"$ncbi_file"
    # Remove any previous notfound sentinel
    rm -f "$dir/ncbi.json.notfound"
    found=$((found + 1))
  else
    # Write sentinel so we don't keep re-queuing this accession
    echo "Not found in NCBI Datasets API as of $(date -I)" >"$dir/ncbi.json.notfound"
    not_found=$((not_found + 1))
    echo "Warning: No datasets result for $id ($common_name) - marked as not found"
  fi
done <"$QUEUE_FILE"

# Clean up (QUEUE_FILE and DATASETS_ERR handled by trap)
rm -f "$ACCESSION_FILE" "$FAILED_FILE"
rm -rf "$RESULT_DIR"

echo ""
echo "NCBI metadata fetching complete: $found found, $not_found not found"
