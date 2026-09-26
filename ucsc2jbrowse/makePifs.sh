#!/bin/bash

#
# makePifs.sh
#
# Builds liftOver PIFs for every UCSC assembly; src/buildConfigs.ts adds the
# synteny tracks for whatever it finds under <db>/liftOver/.
#

set -euo pipefail

source "$(dirname "$0")/common.sh"
source "$(dirname "$0")/../lib/chainpif.sh"

make_pifs_for_assembly() {
  ./createChainTrackPifs.sh liftOver "$(basename "$1")" "$UCSC_BUILT_DIR"
}
export -f make_pifs_for_assembly

# The .checked stamp records which @jbrowse/cli built the directory, so a CLI
# bump (5.0's coarse tier) rebuilds every assembly, and ages out so a chain
# upstream added later is found; REPROCESS forces it.
needs_pifs() {
  [[ -n "${REPROCESS:-}" ]] || ! liftover_stamp_current "$UCSC_BUILT_DIR/$(basename "$1")/liftOver/.checked"
}

# In this shell, so the memo reaches the pipeline's subshells and every job.
load_jbrowse_cli_version
list_assembly_dirs | while IFS= read -r dir; do
  if needs_pifs "$dir"; then
    echo "$dir"
  fi
done | run_parallel_reporting 'liftOver PIFs' -j+0 make_pifs_for_assembly
