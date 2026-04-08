#!/bin/bash
set -euo pipefail

source "$(dirname "$0")/common.sh"

# Call createChainTrackPifs.sh for hs1 with the custom liftOver URL
./createChainTrackPifs.sh liftOver hs1 "$UCSC_BUILT_DIR" "https://hgdownload.soe.ucsc.edu/gbdb/hs1/liftOver/"

log "Adding synteny tracks to config.json..."

node src/createChainTracks.ts --assembly hs1 --source liftOver --output "$UCSC_BUILT_DIR"

log "Done! Synteny tracks added to hs1 config.json"
