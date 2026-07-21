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

# Process hub-like entries. The hub.txt URL is derived from the entry's nibPath
# rather than assumed from the assembly name: most UCSC assembly hubs live at
# /gbdb/<db>/hubs/public/hub.txt, but some entries (e.g. rn8) are GenArk-backed,
# with nibPath hub:/gbdb/genark/<GC[AF] path>, and their hub is served from
# /hubs/<GC[AF] path>/hub.txt.
jq -r '.ucscGenomes | to_entries[] | select(.value.nibPath | (. != null and startswith("hub:"))) | "\(.key)\t\(.value.nibPath)"' <"$UCSC_BUILT_DIR/list.json" | while IFS=$'\t' read -r assembly nibpath; do
  echo "Processing track hub for $assembly..."
  outdir="$UCSC_BUILT_DIR/$assembly"
  mkdir -p "$outdir"

  hubpath="${nibpath#hub:}"
  case "$hubpath" in
  /gbdb/genark/*)
    huburl="https://hgdownload.soe.ucsc.edu/hubs/${hubpath#/gbdb/genark/}/hub.txt"
    ;;
  *)
    huburl="https://hgdownload.soe.ucsc.edu${hubpath}/public/hub.txt"
    ;;
  esac

  node src/generateJBrowseConfigForAssemblyHub.ts "$huburl" "$outdir/config.json"
done
