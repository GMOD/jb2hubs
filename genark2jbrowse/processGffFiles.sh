#!/bin/bash

set -euo pipefail

source "$(dirname "$0")/common.sh"

# Optional first arg: a file listing accessions (one per line) to restrict
# processing to. When omitted, every downloaded GFF is considered.
SCOPE_FILE="${1:-}"

echo "Phase 1: Building queue of GFF files to process..."

# These are cheap per-file stat checks; a single inline pass is faster than a
# parallel fan-out, where the per-job shell spawn dominates the actual work.
# Reprocess when there is no output yet, when the downloaded GFF is newer than
# the existing output (an in-place re-annotation pulled by FETCH_UPDATES), or
# when REPROCESS forces it.
QUEUE_FILE=$(mktemp)
trap 'rm -f "$QUEUE_FILE"' EXIT
while IFS= read -r input_file; do
  output_bgz_file="bgz/${input_file##*/}"
  if [ ! -f "$output_bgz_file" ] || [ "$input_file" -nt "$output_bgz_file" ] || [ -n "${REPROCESS:-}" ]; then
    printf '%s\n' "$input_file"
  fi
done < <(list_scoped_gz gff "$SCOPE_FILE") >"$QUEUE_FILE"

# Count how many files need processing
TOTAL=$(wc -l <"$QUEUE_FILE")

if [ "$TOTAL" -eq 0 ]; then
  echo "No GFF files need processing"
  exit 0
fi

echo "Phase 2: Processing $TOTAL GFF files..."

# Define function to process a single GFF file. It handles cases where start >
# end, sorts, bgzips, and tabix indexes the GFF.
process_gff_file() {
  # GNU parallel runs exported functions in a fresh bash without the parent's
  # `set -euo pipefail`; enable it here so a failed step aborts the job instead
  # of silently producing a truncated output.
  set -eo pipefail
  local input_file="$1"
  local filename
  filename=$(basename "$input_file")
  local output_bgz_file="bgz/$filename"
  local unzipped_file="${input_file%.gz}"

  echo "Processing GFF file: $filename"
  # Decompress, swap start/end if start > end, then recompress and index. Build
  # into temp files and move into place only after tabix succeeds, so a failure
  # never leaves an indexless output that the existence-based gate treats as done.
  pigz -dc "$input_file" | awk -F"\t" 'BEGIN{OFS="\t"} {if ($4 > $5) {temp=$4; $4=$5; $5=temp} print}' >"$unzipped_file"
  jbrowse sort-gff "$unzipped_file" | bgzip -@2 >"$output_bgz_file.tmp"
  tabix -C "$output_bgz_file.tmp"
  mv "$output_bgz_file.tmp" "$output_bgz_file"
  mv "$output_bgz_file.tmp.csi" "$output_bgz_file.csi"
  rm "$unzipped_file" # Clean up unzipped file
}

export -f process_gff_file

# Process the queue in parallel
# Use :::: to read from file for better --bar support
parallel -j8 $PARALLEL_OPTS process_gff_file :::: "$QUEUE_FILE" ||
  echo "WARNING: parallel reported failures while processing GFF files (exit $?)" >&2

echo "GFF processing complete"
