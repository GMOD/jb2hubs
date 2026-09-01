#!/bin/bash

#
# makePifs.sh
#
# Builds liftOver PIFs for every UCSC assembly; src/buildConfigs.ts adds the
# synteny tracks for whatever it finds under <db>/liftOver/.
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

list_assembly_dirs | while IFS= read -r dir; do
  if needs_pifs "$dir"; then
    echo "$dir"
  fi
done | run_parallel_reporting 'liftOver PIFs' -j+0 make_pifs_for_assembly
