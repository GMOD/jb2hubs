#!/bin/bash

set -euo pipefail

source "$(dirname "$0")/common.sh"

# Optional first arg: a file listing accessions (one per line) to restrict the
# download to. When omitted, every NCBI GFF in all.json is considered.
SCOPE_FILE="${1:-}"

# A GFF we do not have is fetched. One we have is fetched again only when NCBI
# has re-annotated the assembly at the same url, which staleNcbiGffs.ts finds by
# comparing the file's own header with the hub's ncbi.json, locally; the rest
# cost no request. FETCH_UPDATES=1 instead revalidates every file with a
# conditional request, which is also what catches a re-annotation whose ncbi.json
# has not been refreshed yet.
#
# The url is DERIVED, not published: hubtools' parseAssemblyEntry builds it from
# the accession, and for an assembly NCBI never annotated the directory is there
# and the *_genomic.gff.gz simply is not (checked by hand on GCF_002986165.1 --
# fna, gbff and the report, no gff). Existence of the download was the only
# gate, so those urls were re-requested on EVERY run, forever: measured
# 2026-09-09, the same 71 urls attempted and failed in every log going back
# weeks. A sentinel beside the missing download records the 404 the way
# ncbi.json.notfound records a missing metadata record, and NOTFOUND_TTL_DAYS
# makes it expire so an annotation published later is still picked up. gff/ is
# gitignored, so the mtime clock buildNcbiQueue.ts avoids (a fresh clone resets
# it) does not apply here.
NOTFOUND_TTL_DAYS=90

# Re-annotated GFFs fetched per run, so a burst of re-annotation trickles in
# over several runs the way buildNcbiQueue.ts's REFRESH_MAX spreads ncbi.json.
STALE_GFF_MAX="${STALE_GFF_MAX:-1000}"

# Whether a 404 recorded earlier still stands. Absent or expired means ask
# upstream again; FETCH_UPDATES means ask regardless.
gff_notfound_current() {
  local age
  if [ -n "${FETCH_UPDATES:-}" ]; then
    return 1
  fi
  stamp_age_days age "$1" && [ "$age" -lt "$NOTFOUND_TTL_DAYS" ]
}

# Fetches one queue line (url|common_name|filename) into gff/.
#
# - Conditional on the copy we have (If-Modified-Since from its mtime), so
#   asking about a file that has not changed costs a 304 and no transfer.
# - Into a temp file moved into place only once complete. wget wrote in place,
#   and a truncated download "exists" to every gate after it.
# - The new copy's mtime is when we fetched it, not upstream's Last-Modified,
#   which `wget -N` kept. processGffFiles.sh rebuilds bgz/ only from a GFF newer
#   than it, and a re-annotation can predate our last rebuild: GCF_000092205.1
#   was replaced upstream on 2026-07-04 and its bgz/ rebuilt on 2026-07-21, so
#   the new file would have been downloaded and never processed.
# - Only a 404/410 is "NCBI does not publish this", and only that is recorded.
#   A timeout or 5xx leaves no sentinel, so an ftp.ncbi.nlm.nih.gov blip cannot
#   switch off an annotation we do have a url for.
fetch_ncbi_gff() {
  local url common_name filename
  IFS='|' read -r url common_name filename <<<"$1"
  local out="gff/$filename" status rc=0
  local -a since=()
  if [ -f "$out" ]; then
    since=(-z "$out")
  fi
  echo "Fetching GFF file for $common_name: $url"
  status=$(curl -sL --connect-timeout 30 --speed-limit 1024 --speed-time 120 \
    "${since[@]}" -o "$out.tmp" -w '%{http_code}' "$url") || rc=$?
  if [ "$rc" = 0 ] && [ "$status" = 200 ]; then
    mv "$out.tmp" "$out"
    rm -f "$out.notfound"
    echo "OK $common_name: $filename"
    return
  fi
  rm -f "$out.tmp"
  if [ "$rc" = 0 ] && [ "$status" = 304 ]; then
    echo "Unchanged $common_name: $filename"
  elif [ "$rc" = 0 ] && { [ "$status" = 404 ] || [ "$status" = 410 ]; }; then
    printf 'HTTP %s as of %s\n' "$status" "$(date +%F)" >"$out.notfound"
    echo "No GFF published for $common_name ($status): $url" >&2
  else
    echo "Failed to download $common_name (HTTP $status, curl exit $rc): $url" >&2
  fi
}
export -f fetch_ncbi_gff

# Skip when sourced (by the test script) so only the functions are loaded.
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
  SCOPE_ACCESSIONS='[]'
  if [ -n "$SCOPE_FILE" ]; then
    SCOPE_ACCESSIONS=$(jq -R -s 'split("\n") | map(select(length > 0))' "$SCOPE_FILE")
  fi

  echo "Phase 1: Building queue of GFF files to download..."
  QUEUE_FILE=$(mktemp)
  STALE_FILE=$(mktemp)
  trap 'rm -f "$QUEUE_FILE" "$STALE_FILE"' EXIT
  # A failed check costs this run its refreshes, not its new downloads.
  if [ -z "${FETCH_UPDATES:-}" ] &&
    ! node "$(dirname "$0")/src/staleNcbiGffs.ts" >"$STALE_FILE"; then
    echo "staleNcbiGffs.ts failed; re-annotated GFFs are not fetched again this run" >&2
    : >"$STALE_FILE"
  fi
  declare -A stale=()
  while IFS= read -r f; do
    stale[$f]=1
  done <"$STALE_FILE"

  # Extract NCBI GFF URLs from processed JSON. Filter out null entries and null
  # ncbiGff before test(); when a scope list is given, also restrict to those
  # accessions (an empty list means "no restriction"). The per-file decision is
  # a stat and a lookup, so a single inline pass beats a parallel fan-out.
  # needs_gff_fetch (lib/common.sh) is the gate ucsc2jbrowse/downloadNcbiGff.sh
  # applies per db. Output: url|common_name|filename
  jq -r --argjson accs "$SCOPE_ACCESSIONS" '
    .[] | select(. != null)
    | select(.ncbiGff != null) | select(.ncbiGff | test("GCF_"))
    | select(.accession as $a | ($accs | length) == 0 or ($accs | index($a)))
    | "\(.ncbiGff)\t\(.commonName)"' processedHubJson/all.json |
    {
      stale_queued=0
      while IFS=$'\t' read -r url common_name; do
        filename=${url##*/}
        if gff_notfound_current "gff/$filename.notfound"; then
          continue
        fi
        if needs_gff_fetch "gff/$filename"; then
          printf '%s|%s|%s\n' "$url" "$common_name" "$filename"
        elif [ -n "${stale[$filename]:-}" ] && [ "$stale_queued" -lt "$STALE_GFF_MAX" ]; then
          stale_queued=$((stale_queued + 1))
          printf '%s|%s|%s\n' "$url" "$common_name" "$filename"
        fi
      done
      if [ "$stale_queued" -gt 0 ]; then
        echo "Fetching $stale_queued re-annotated GFF(s) again (at most $STALE_GFF_MAX a run)" >&2
      fi
    } >"$QUEUE_FILE"

  # Say how many are being skipped on a recorded 404 -- a suppression nobody can
  # see is how a whole class of assembly quietly stops getting an annotation.
  TOTAL=$(wc -l <"$QUEUE_FILE")
  NOTFOUND=$(find gff -maxdepth 1 -name '*.notfound' -print | grep -c . || true)
  if [ "$NOTFOUND" -gt 0 ]; then
    echo "$NOTFOUND GFF url(s) recorded as 404 at NCBI; re-probed after ${NOTFOUND_TTL_DAYS}d"
  fi

  if [ "$TOTAL" -eq 0 ]; then
    echo "No GFF files need downloading"
    exit 0
  fi

  echo "Phase 2: Fetching $TOTAL GFF files (rate-limited)..."
  # Serially, to avoid overwhelming NCBI's servers; :::: reads the queue file
  # for better --bar support.
  parallel -j1 $PARALLEL_OPTS fetch_ncbi_gff :::: "$QUEUE_FILE"

  echo "GFF download complete"
fi
