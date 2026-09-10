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
#
# Plus the negative half, which was missing. The url is DERIVED, not published:
# hubtools' parseAssemblyEntry builds it from the accession, and for an assembly
# NCBI never annotated the directory is there and the *_genomic.gff.gz simply is
# not (checked by hand on GCF_002986165.1 -- fna, gbff and the report, no gff).
# Existence of the download was the only gate, so those urls were re-requested
# on EVERY run, forever: measured 2026-09-09, the same 71 urls attempted and
# failed in every log going back weeks, 142 lines of "Fetching.../Failed..." and
# 71 pointless requests at ftp.ncbi.nlm.nih.gov each time. A sentinel beside the
# missing download records the 404 the way ncbi.json.notfound records a missing
# metadata record, and NOTFOUND_TTL_DAYS makes it expire so an annotation
# published later is still picked up. gff/ is gitignored, so the mtime clock
# buildNcbiQueue.ts avoids (a fresh clone resets it) does not apply here.
NOTFOUND_TTL_DAYS=90

# Whether a 404 recorded earlier still stands. Absent or expired means ask
# upstream again; FETCH_UPDATES means ask regardless.
gff_notfound_current() {
  local age
  if [ -n "${FETCH_UPDATES:-}" ]; then
    return 1
  fi
  stamp_age_days age "$1" && [ "$age" -lt "$NOTFOUND_TTL_DAYS" ]
}

QUEUE_FILE=$(mktemp)
trap 'rm -f "$QUEUE_FILE"' EXIT
jq -r --argjson accs "$SCOPE_ACCESSIONS" '
  .[] | select(. != null)
  | select(.ncbiGff != null) | select(.ncbiGff | test("GCF_"))
  | select(.accession as $a | ($accs | length) == 0 or ($accs | index($a)))
  | "\(.ncbiGff)\t\(.commonName)"' processedHubJson/all.json |
  while IFS=$'\t' read -r url common_name; do
    filename=${url##*/}
    if needs_gff_fetch "gff/$filename" && ! gff_notfound_current "gff/$filename.notfound"; then
      printf '%s|%s|%s\n' "$url" "$common_name" "$filename"
    fi
  done >"$QUEUE_FILE"

# Count how many files need downloading, and say how many are being skipped on a
# recorded 404 -- a suppression nobody can see is how a whole class of assembly
# quietly stops getting an annotation.
TOTAL=$(wc -l <"$QUEUE_FILE")
NOTFOUND=$(find gff -maxdepth 1 -name '*.notfound' -print | grep -c . || true)
if [ "$NOTFOUND" -gt 0 ]; then
  echo "$NOTFOUND GFF url(s) recorded as 404 at NCBI; re-probed after ${NOTFOUND_TTL_DAYS}d"
fi

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
    rm -f "gff/$filename.notfound"
    echo "OK $common_name: $filename"
    return
  fi

  # Which failure it was decides whether it is worth asking again tomorrow, and
  # the split is the same one checkIfFileAccessible and mirrorSidecars draw:
  # only a 404/410 is "NCBI does not publish this", and only that is recorded.
  # A timeout or 5xx leaves no sentinel, so an ftp.ncbi.nlm.nih.gov blip cannot
  # switch off an annotation we do have a url for. One extra HEAD, and only on a
  # failure -- so the steady state after this lands is zero requests, not 71.
  # No `|| echo 000` fallback: curl already writes 000 when it never got a
  # response, and the two together concatenate into "000000", which matches
  # neither branch and reads as a status nobody has ever seen.
  local status
  status=$(curl -sIL -m 30 -o /dev/null -w '%{http_code}' "$url")
  if [ "$status" = 404 ] || [ "$status" = 410 ]; then
    printf 'HTTP %s as of %s\n' "$status" "$(date +%F)" >"gff/$filename.notfound"
    echo "No GFF published for $common_name ($status): $url" >&2
  else
    echo "Failed to download $common_name (HTTP $status): $url" >&2
  fi
}

export -f download_ncbi_gff

# Process the queue serially to avoid overwhelming FTP servers
# Use :::: to read from file for better --bar support
parallel -j1 $PARALLEL_OPTS download_ncbi_gff :::: "$QUEUE_FILE"

echo "GFF download complete"
