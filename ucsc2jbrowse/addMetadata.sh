#!/bin/bash

#
# addMetadata.sh
#
# Adds metadata from trackDb.sql to the JBrowse config.json for each assembly.
#

# set -euo pipefail

source "$(dirname "$0")/common.sh"

# --- Functions ---

# Processes a single assembly.
# $1: The assembly directory in the results folder.
process_assembly() {
  local assembly_dir=$1
  local assembly_name
  assembly_name=$(basename "$assembly_dir")

  # Skip non-assembly directories
  if [[ "$assembly_name" == "trix" ]]; then
    return 0
  fi

  local config_file="$assembly_dir/config.json"
  local tracks_file="$assembly_dir/tracks.json"

  # Add metadata from the tracksDb.sql to the config.json
  node src/addMetadata.ts "$config_file" "$tracks_file"
}

export -f process_assembly
export UCSC_BUILT_DIR

# --- Main Script ---

if [ $# -ne 1 ]; then
  echo "Usage: $0 <ucsc_results_dir>"
  exit 1
fi

# Run the process_assembly function in parallel for each input directory.
find "$1" -mindepth 1 -maxdepth 1 -type d ! -name "trix" | parallel $PARALLEL_OPTS --will-cite process_assembly {}
