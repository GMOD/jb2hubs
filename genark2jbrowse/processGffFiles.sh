#!/bin/bash

set -euo pipefail

source "$(dirname "$0")/common.sh"

# Optional first arg: a file listing accessions (one per line) to restrict
# processing to. When omitted, every downloaded GFF is considered.
SCOPE_FILE="${1:-}"

# Lists the candidate input GFFs (NUL-separated): either every file under gff/,
# or just those belonging to the scoped accessions.
list_gff_inputs() {
  if [ -n "$SCOPE_FILE" ]; then
    while IFS= read -r acc; do
      [ -n "$acc" ] || continue
      for f in gff/"$acc"_*.gz; do
        if [ -f "$f" ]; then
          printf '%s\0' "$f"
        fi
      done
    done <"$SCOPE_FILE"
  else
    find gff -name "*.gz" -print0
  fi
}

echo "Phase 1: Building queue of GFF files to process..."

# Define function to check if a GFF file needs processing
check_and_queue() {
  local input_file="$1"
  local filename
  filename=$(basename "$input_file")
  local output_bgz_file="bgz/$filename"

  # Reprocess when there is no output yet, when the downloaded GFF is newer than
  # the existing output (an in-place re-annotation pulled by FETCH_UPDATES), or
  # when REPROCESS forces it.
  if [ ! -f "$output_bgz_file" ] || [ "$input_file" -nt "$output_bgz_file" ] || [ -n "${REPROCESS:-}" ]; then
    echo "$input_file"
  fi
}

export -f check_and_queue

# Build the queue in parallel (fast I/O operations)
QUEUE_FILE=$(mktemp)
trap 'rm -f "$QUEUE_FILE"' EXIT
list_gff_inputs | parallel -0 $PARALLEL_OPTS check_and_queue {} >"$QUEUE_FILE"

# Count how many files need processing
TOTAL=$(wc -l <"$QUEUE_FILE")

if [ "$TOTAL" -eq 0 ]; then
  echo "No GFF files need processing"
  rm "$QUEUE_FILE"
  exit 0
fi

echo "Phase 2: Processing $TOTAL GFF files..."

# Define function to process a single GFF file. It handles cases where start >
# end, sorts, bgzips, and tabix indexes the GFF.
process_gff_file() {
  set -o pipefail
  local input_file="$1"
  local filename
  filename=$(basename "$input_file")
  local output_bgz_file="bgz/$filename"
  local unzipped_file="${input_file%.gz}"

  echo "Processing GFF file: $filename"
  # Decompress, swap start/end if start > end, then recompress and index
  pigz -dc "$input_file" | awk -F"\t" 'BEGIN{OFS="\t"} {if ($4 > $5) {temp=$4; $4=$5; $5=temp} print}' >"$unzipped_file"
  jbrowse sort-gff "$unzipped_file" | bgzip -@2 >"$output_bgz_file"
  tabix -C "$output_bgz_file"
  rm "$unzipped_file" # Clean up unzipped file
}

export -f process_gff_file

# Process the queue in parallel
# Use :::: to read from file for better --bar support
parallel -j8 $PARALLEL_OPTS process_gff_file :::: "$QUEUE_FILE" || true

# Clean up
rm "$QUEUE_FILE"

echo "GFF processing complete"
