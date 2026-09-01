#!/bin/bash
set -euo pipefail

source "$(dirname "$0")/common.sh"

# hs1's liftOver chains live under /gbdb rather than goldenPath; the synteny
# tracks for the PIFs are added by src/buildConfigs.ts like every other
# assembly's.
./createChainTrackPifs.sh liftOver hs1 "$UCSC_BUILT_DIR" "https://hgdownload.soe.ucsc.edu/gbdb/hs1/liftOver/"
