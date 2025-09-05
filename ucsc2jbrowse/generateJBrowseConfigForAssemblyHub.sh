#!/bin/bash

#
# makeTrackHubConfigs.sh
#
# Creates JBrowse configuration files from UCSC track hubs.
#

set -euo pipefail

# --- Configuration ---

: ${UCSC_RESULTS_DIR:=~/ucscResults}

export NODE_OPTIONS="--no-warnings=ExperimentalWarning"
export PATH=$(pwd):$PATH

# --- Main Script ---

mkdir -p "$UCSC_RESULTS_DIR"

if [ ! -f "$UCSC_RESULTS_DIR/list.json" ]; then
  echo "Fetching latest UCSC genome list..."
  curl -s https://api.genome.ucsc.edu/list/ucscGenomes >"$UCSC_RESULTS_DIR/list.json"
fi

# Process hub-like entries
cat "$UCSC_RESULTS_DIR/list.json" | jq -r '.ucscGenomes | to_entries[] | select(.value.nibPath | (. != null and startswith("hub:"))) | .key' | while read -r assembly; do
  echo "Processing track hub for $assembly..."
  outdir="$UCSC_RESULTS_DIR/$assembly"
  mkdir -p "$outdir"
  node src/generateJBrowseConfigForAssemblyHub.ts "https://hgdownload.soe.ucsc.edu/gbdb/$assembly/hubs/public/hub.txt" "$outdir/config.json"
done
