#!/bin/bash

#
# downloadAll.sh
#
# Downloads the UCSC Golden Path data for all assemblies.
#

set -euo pipefail

SCRIPT_DIR="$(dirname "$0")"
source "$SCRIPT_DIR/common.sh"
cd "$SCRIPT_DIR"

# --- Configuration ---

: ${UCSC_ALT_DATA_DIR:=~/ucscAlt}

# --- Main Script ---

log "Starting UCSC data download."

ensure_dir "$UCSC_RESULTS_DIR"

log "Fetching latest UCSC genome list..."
curl -s https://api.genome.ucsc.edu/list/ucscGenomes >"$UCSC_RESULTS_DIR/list.json"

log "Downloading non-hub assemblies..."
# Filter for assemblies that are not from a hub.
jq -r '.ucscGenomes | to_entries[] | select(.value.nibPath | (. != null and startswith("hub:") | not)) | .key' "$UCSC_RESULTS_DIR/list.json" | while read -r assembly; do
  if [ "$assembly" = "cb1" ]; then
    log "Skipping $assembly genome."
    continue
  fi
  log "Syncing $assembly data..."
  ensure_dir "$UCSC_DATA_DIR/$assembly/$assembly"
  rsync --max-size=2G -qavzP rsync://hgdownload.cse.ucsc.edu/goldenPath/"$assembly"/database "$UCSC_DATA_DIR/$assembly/$assembly/"
done

log "Downloading hgFixed assembly..."
ensure_dir "$UCSC_ALT_DATA_DIR/hgFixed/hgFixed"
rsync --max-size=2G -azP rsync://hgdownload.cse.ucsc.edu/goldenPath/hgFixed/database "$UCSC_ALT_DATA_DIR/hgFixed/hgFixed/"

log "Download finished successfully!"
