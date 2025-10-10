#!/bin/bash -e

# This script processes the hs1 liftOver files

# Call createChainTrackPifs.sh for hs1 with the custom liftOver URL
./createChainTrackPifs.sh liftOver hs1 "${UCSC_RESULTS_DIR:-~/ucscResults}" "https://hgdownload.soe.ucsc.edu/gbdb/hs1/liftOver/"

echo "Adding synteny tracks to config.json..."

node src/createChainTracks.ts --assembly hs1 --source liftOver --output "$UCSC_RESULTS_DIR"

echo "Done! Synteny tracks added to ${ASSEMBLY_DIR}/config.json"
