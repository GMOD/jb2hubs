#!/bin/bash

set -euo pipefail

source "$(dirname "$0")/common.sh"

find "$UCSC_DOWNLOADS_DIR" -maxdepth 1 -mindepth 1 -type d | while IFS= read -r dir; do
  assembly=$(basename "$dir")
  [[ ! -f "$UCSC_BUILT_DIR/$assembly/liftOver/.checked" ]] && echo "$dir"
done | parallel --halt never -j+0 $PARALLEL_OPTS "
  assembly=\$(basename \"{}\")
  ./createChainTrackPifs.sh liftOver \"\$assembly\" \"$UCSC_BUILT_DIR\"
" || true

find "$UCSC_DOWNLOADS_DIR" -maxdepth 1 -mindepth 1 -type d | parallel --halt never -j+0 $PARALLEL_OPTS "
  assembly=\$(basename \"{}\")
  node src/createChainTracks.ts -a \"\$assembly\" --source liftOver -o \"$UCSC_BUILT_DIR\"
" || true
