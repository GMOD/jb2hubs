#!/bin/bash

set -euo pipefail

source "$(dirname "$0")/common.sh"

# Optional first arg: a file listing accessions (one per line) to restrict the
# download to. When omitted, every NCBI GFF in all.json is considered.
SCOPE_FILE="${1:-}"
SCOPE_ACCESSIONS='[]'
if [ -n "$SCOPE_FILE" ]; then
  SCOPE_ACCESSIONS=$(jq -R -s 'split("\n") | map(select(length > 0))' "$SCOPE_FILE")
fi

# NCBI assembly URLs are versioned and immutable, so a new annotation or
# assembly normally arrives as a new accession (new filename) and is picked up
# automatically. By default we therefore only fetch files we don't already
# have. Set FETCH_UPDATES=1 to instead revalidate every file with a conditional
# request (wget -N), which re-pulls in-place re-annotations published at the
# same URL. This is the replacement for rsync, which NCBI retired 2026-06-01.
echo "Phase 1: Building queue of GFF files to download..."

# Extract NCBI GFF URLs from processed JSON. Filter out null entries and null
# ncbiGff before test(); when a scope list is given, also restrict to those
# accessions (an empty list means "no restriction").
#
# The per-file decision is a cheap stat check, so a single inline pass beats a
# parallel fan-out (one shell spawn per line). needs_gff_fetch (lib/common.sh)
# is the same gate ucsc2jbrowse/downloadNcbiGff.sh applies per db: with
# FETCH_UPDATES we queue everything and let wget -N decide per file, otherwise
# only files we don't already have. Output: url|common_name|filename
QUEUE_FILE=$(mktemp)
trap 'rm -f "$QUEUE_FILE"' EXIT
jq -r --argjson accs "$SCOPE_ACCESSIONS" '
  .[] | select(. != null)
  | select(.ncbiGff != null) | select(.ncbiGff | test("GCF_"))
  | select(.accession as $a | ($accs | length) == 0 or ($accs | index($a)))
  | "\(.ncbiGff)\t\(.commonName)"' processedHubJson/all.json |
  while IFS=$'\t' read -r url common_name; do
    filename=${url##*/}
    if needs_gff_fetch "gff/$filename"; then
      printf '%s|%s|%s\n' "$url" "$common_name" "$filename"
    fi
  done >"$QUEUE_FILE"

# Count how many files need downloading
TOTAL=$(wc -l <"$QUEUE_FILE")

if [ "$TOTAL" -eq 0 ]; then
  echo "No GFF files need downloading"
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
  local url common_name filename
  IFS='|' read -r url common_name filename <<<"$line"

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

echo "GFF download complete"
