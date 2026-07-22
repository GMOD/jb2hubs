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

add_chain_tracks_for_assembly() {
  node src/createChainTracks.ts -a "$(basename "$1")" --source liftOver -o "$UCSC_BUILT_DIR"
}
export -f add_chain_tracks_for_assembly

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

find "$UCSC_DOWNLOADS_DIR" -maxdepth 1 -mindepth 1 -type d |
  parallel -j+0 $PARALLEL_OPTS add_chain_tracks_for_assembly || true
