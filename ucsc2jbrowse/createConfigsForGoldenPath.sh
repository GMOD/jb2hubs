#!/bin/bash

#
# createConfigsForGoldenPath.sh
#
# Creates the JBrowse configuration for each assembly.
#

set -euo pipefail

source "$(dirname "$0")/common.sh"

# --- Functions ---

# Processes a single assembly.
# $1: The assembly directory in the data folder.
process_assembly() {
  local assembly_data_dir=$1
  local assembly_name
  assembly_name=$(basename "$assembly_data_dir")
  local assembly_results_dir="$UCSC_RESULTS_DIR/$assembly_name"

  for i in "$assembly_results_dir"/*.bed.gz; do
    node src/addBedTabixTrackToConfig.ts "$assembly_results_dir/config.json" "$i"
  done

  for i in "$assembly_results_dir"/*.gff.gz; do
    node src/addGffTabixTrackToConfig.ts "$assembly_results_dir/config.json" "$i"
  done

  # Optional: remove older copies of tracks, e.g. older dbSnp, older GENCODE, etc.
  node src/removeEverythingButLatest.ts "$assembly_results_dir/config.json"
}

export -f process_assembly
export UCSC_RESULTS_DIR

# --- Main Script ---

if [ $# -eq 0 ]; then
  echo "Usage: $0 <assembly_data_dir1> [assembly_data_dir2] ..."
  exit 1
fi

# Run the process_assembly function in parallel for each input directory.
parallel $PARALLEL_OPTS --will-cite process_assembly ::: "$@"
