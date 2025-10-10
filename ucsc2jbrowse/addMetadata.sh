#!/bin/bash

#
# addMetadata.sh
#
# Adds metadata from trackDb.sql to the JBrowse config.json for each assembly.
#

# set -euo pipefail

# --- Configuration ---

# Set the root directory for results.
# Can be overridden by setting the environment variable.
: ${UCSC_RESULTS_DIR:=~/ucscResults}

export LC_ALL=C
export NODE_OPTIONS="--no-warnings=ExperimentalWarning"

# --- Functions ---

# Processes a single assembly.
# $1: The assembly directory in the results folder.
process_assembly() {
  echo $1
  local assembly_dir=$1
  local assembly_name
  assembly_name=$(basename "$assembly_dir")
  local config_file="$assembly_dir/config.json"
  local tracks_file="$assembly_dir/tracks.json"
  local temp_config_file="$assembly_dir/tmp.json"

  # echo "Adding metadata to $assembly_name..."

  # Add metadata from the tracksDb.sql to the config.json
  node src/addMetadata.ts "$config_file" "$tracks_file"
}

export -f process_assembly
export UCSC_RESULTS_DIR

# --- Main Script ---

if [ $# -eq 0 ]; then
  echo "Usage: $0 <assembly_dir1> [assembly_dir2] ..."
  exit 1
fi

# Run the process_assembly function in parallel for each input directory.
parallel $PARALLEL_OPTS --will-cite process_assembly ::: "$@"
