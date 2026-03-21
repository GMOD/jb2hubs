#!/bin/bash

source "$(dirname "$0")/common.sh"

find "$UCSC_DOWNLOADS_DIR" -maxdepth 1 -mindepth 1 -type d | parallel -j+0 $PARALLEL_OPTS '
  assembly=$(basename "{}")
  ./createChainTrackPifs.sh liftOver "$assembly" "$UCSC_BUILT_DIR"
  # ./createChainTrackPifs.sh vs "$assembly" "$UCSC_BUILT_DIR"
'

find "$UCSC_DOWNLOADS_DIR" -maxdepth 1 -mindepth 1 -type d | parallel -j+0 $PARALLEL_OPTS '
  assembly=$(basename "{}")
  node src/createChainTracks.ts -a "$assembly" --source liftOver -o "$UCSC_BUILT_DIR"
  # node src/createChainTracks.ts -a "$assembly" --source vs -o "$UCSC_BUILT_DIR"
'
