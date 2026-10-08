#!/bin/bash
#
# downloadGencode.sh
#
# Fetches the GENCODE GFF3s src/gencodeTracks.ts lists, then sorts, bgzips and
# tabix-indexes each into GENCODE_PROCESSED_DIR. The tracks themselves are
# added by src/buildConfigs.ts from that table, so a release bump is one edit.

set -euo pipefail

source "$(dirname "$0")/common.sh"
# Configuration - can be overridden via environment variables
GENCODE_DIR="${GENCODE_DIR:-/mnt/sdb/cdiesh/gencode}"
GENCODE_PROCESSED_DIR="${GENCODE_PROCESSED_DIR:-/mnt/sdb/cdiesh/gencode_processed}"
export GENCODE_PROCESSED_DIR

mkdir -p "$GENCODE_DIR" "$GENCODE_PROCESSED_DIR"

process_gff_file() {
  local url=$1
  local filename
  filename=$(basename "$url")
  local gff_file="${filename%.gz}"
  local sorted_gff_file="${gff_file%.gff3}.sorted.gff3"

  local downloaded_gz_file="$GENCODE_DIR/$filename"
  local temp_gff_file="$GENCODE_PROCESSED_DIR/$gff_file"
  local output_sorted_gff_file="$GENCODE_PROCESSED_DIR/$sorted_gff_file"
  local output_sorted_gff_gz="$output_sorted_gff_file.gz"

  # A GENCODE url names its release, so a copy on disk is current and costs no
  # request. `wget -N` revalidated every file on every run with no deadline,
  # and one stalled EBI connection ended a run 17 minutes later.
  if [ ! -f "$downloaded_gz_file" ]; then
    curl -fsSL --connect-timeout 30 --speed-limit 1024 --speed-time 120 \
      --retry 3 -o "$downloaded_gz_file.tmp" "$url"
    mv "$downloaded_gz_file.tmp" "$downloaded_gz_file"
  fi

  if [ ! -f "$output_sorted_gff_gz" ] || [ ! -f "$output_sorted_gff_gz.csi" ]; then
    log "Sorting and indexing $filename..."
    zcat "$downloaded_gz_file" >"$temp_gff_file"
    "$JBROWSE_CLI" sort-gff "$temp_gff_file" >"$output_sorted_gff_file"
    rm "$temp_gff_file"
    bgzip -f -@8 "$output_sorted_gff_file"
    tabix -C -p gff "$output_sorted_gff_gz"
  fi
}

while IFS=$'\t' read -r _db url; do
  process_gff_file "$url"
done < <(node src/gencodeTracks.ts)

log "All GENCODE files processed."
