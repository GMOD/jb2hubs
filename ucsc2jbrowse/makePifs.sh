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
done | parallel -j+0 $PARALLEL_OPTS make_pifs_for_assembly || true

# One process for every assembly, not one per assembly: createChainTracks.ts
# consults genark's all.json (~73MB) and list.json to name a track after its
# target's species, and fanning it out re-parsed those per assembly -- ~250 full
# parses of the same file, 1.7s and 326MB each, on every build. Batched, they are
# read at most once, and only if some PIF actually targets an accession.
find "$UCSC_DOWNLOADS_DIR" -maxdepth 1 -mindepth 1 -type d -printf '%f\n' |
  node src/createChainTracks.ts --source liftOver -o "$UCSC_BUILT_DIR" || true
