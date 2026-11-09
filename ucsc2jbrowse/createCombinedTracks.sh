#!/bin/bash
#
# createCombinedTracks.sh
#
# Writes <db>/combined/<composite>-<type>.bed.gz for each family in
# combinedTracks/<db>.json: the composite's bigBed subtracks, as trackDb lists
# them on this run, rsynced from hgdownload's /gbdb/ into <db>/gbdb/ under the
# downloads directory (a top-level gbdb/ would read as an assembly to
# list_assembly_dirs), and dumped into one
# tabix-indexed BED with a `source` column. A family rebuilds when a source
# file, the source list or this code changes.
#
# Usage: ./createCombinedTracks.sh [--skip-download]

set -euo pipefail

source "$(dirname "$0")/common.sh"
cd "$(dirname "$0")"

SKIP_RSYNC=false
if [ "${1:-}" = --skip-download ]; then
  SKIP_RSYNC=true
fi
CODE=(createCombinedTracks.sh src/combinedTracks.ts)

combined_bed() {
  local tmp rc=0
  tmp=$(mktemp)
  node src/combinedTracks.ts combine "$@" >"$tmp" || rc=$?
  if [ "$rc" -eq 0 ]; then
    head -n 1 "$tmp"
    tail -n +2 "$tmp" | sort -S 2G -k1,1 -k2,2n || rc=$?
  fi
  rm -f "$tmp"
  return "$rc"
}

combine_family() {
  local db="$1" tracks_json="$2" list="$3" key="$4" gbdb_dir="$5" out members
  out="$UCSC_BUILT_DIR/$db/combined/$key.bed.gz"
  members=$(mktemp)
  awk -F'\t' -v k="$key" '$1 == k' "$list" >"$members"
  local sources=()
  mapfile -t sources < <(cut -f3 "$members" | sed "s#^#$gbdb_dir/#")
  mkdir -p "$(dirname "$out")"
  if needs_rebuild "$out" "$members" "$out.hash" "${CODE[@]}" "${sources[@]}"; then
    if write_indexed_gz_from "$out" bed combined_bed "$db" "$tracks_json" "$key" "$gbdb_dir"; then
      save_rebuild_stamp "$out" "$members" "$out.hash" "${CODE[@]}" "${sources[@]}"
      log "Combined ${#sources[@]} sources into $db/combined/$key.bed.gz"
    else
      log "Combining $db's $key failed; keeping the previous file"
    fi
  fi
  rm -f "$members"
}

for spec in combinedTracks/*.json; do
  db=$(basename "$spec" .json)
  tracks_json="$UCSC_BUILT_DIR/$db/tracks.json"
  if [ ! -f "$tracks_json" ]; then
    log "$db has no tracks.json; no combined tracks for it"
    continue
  fi
  gbdb_dir="$UCSC_DOWNLOADS_DIR/$db/gbdb"
  list=$(mktemp)
  node src/combinedTracks.ts sources "$db" "$tracks_json" >"$list"
  if [ "$SKIP_RSYNC" = false ] && [ -s "$list" ]; then
    cut -f3 "$list" | sort -u >"$list.files"
    if ! rsync_ok --timeout=600 -a --files-from="$list.files" \
      rsync://hgdownload.cse.ucsc.edu/gbdb/ "$gbdb_dir/"; then
      log "rsync of $db's combined sources failed; combining the copies on disk"
    fi
    rm -f "$list.files"
  fi
  while read -r key; do
    combine_family "$db" "$tracks_json" "$list" "$key" "$gbdb_dir"
  done < <(cut -f1 "$list" | uniq)
  rm -f "$list"
done
