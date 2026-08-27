#!/bin/bash

#
# makePifs.sh
#
# Builds liftOver PIFs for every UCSC assembly and adds the resulting synteny
# tracks to their configs.
#

set -euo pipefail

source "$(dirname "$0")/common.sh"

make_pifs_for_assembly() {
  ./createChainTrackPifs.sh liftOver "$(basename "$1")" "$UCSC_BUILT_DIR"
}
export -f make_pifs_for_assembly

# REPROCESS forces regen (e.g. to add the coarse PIF tier); createChainTrackPifs.sh
# then clears the .checked stamp and overwrites existing outputs.
needs_pifs() {
  [[ -n "${REPROCESS:-}" ]] || [[ ! -f "$UCSC_BUILT_DIR/$(basename "$1")/liftOver/.checked" ]]
}

find "$UCSC_DOWNLOADS_DIR" -maxdepth 1 -mindepth 1 -type d | while IFS= read -r dir; do
  if needs_pifs "$dir"; then
    echo "$dir"
  fi
done | run_parallel_reporting 'liftOver PIFs' -j+0 make_pifs_for_assembly

# One process for every assembly, not one per assembly: createChainTracks.ts
# consults genark's all.json (~73MB) and list.json to name a track after its
# target's species, and fanning it out re-parsed those per assembly -- ~250 full
# parses of the same file, 1.7s and 326MB each, on every build. Batched, they are
# read at most once, and only if some PIF actually targets an accession.
#
# Batching also makes this all-or-nothing: one failure costs the synteny tracks
# on every assembly. It stays non-fatal -- the configs the rest of the build
# wrote are still good -- but it says so instead of reading as a no-op.
chain_tracks_status=0
find "$UCSC_DOWNLOADS_DIR" -maxdepth 1 -mindepth 1 -type d -printf '%f\n' |
  node src/createChainTracks.ts --source liftOver -o "$UCSC_BUILT_DIR" || chain_tracks_status=$?
if [ "$chain_tracks_status" -ne 0 ]; then
  echo "WARNING: createChainTracks.ts exited $chain_tracks_status; no synteny tracks were added to any UCSC config this run" >&2
fi
