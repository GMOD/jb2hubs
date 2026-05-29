#!/bin/bash

#
# generateJBrowseConfigForAssemblyHub.sh
#
# Creates JBrowse configuration files from UCSC track hubs.
#

set -euo pipefail

source "$(dirname "$0")/common.sh"

# --- Main Script ---

mkdir -p "$UCSC_BUILT_DIR"

if [ ! -f "$UCSC_BUILT_DIR/list.json" ]; then
  echo "Fetching latest UCSC genome list..."
  curl -s https://api.genome.ucsc.edu/list/ucscGenomes >"$UCSC_BUILT_DIR/list.json"
fi

# Process hub-like entries
jq -r '.ucscGenomes | to_entries[] | select(.value.nibPath | (. != null and startswith("hub:"))) | .key' <"$UCSC_BUILT_DIR/list.json" | while read -r assembly; do
  echo "Processing track hub for $assembly..."
  outdir="$UCSC_BUILT_DIR/$assembly"
  mkdir -p "$outdir"
  node src/generateJBrowseConfigForAssemblyHub.ts "https://hgdownload.soe.ucsc.edu/gbdb/$assembly/hubs/public/hub.txt" "$outdir/config.json"
done
