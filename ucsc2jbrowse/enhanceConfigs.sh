#!/bin/bash

#
# enhanceConfigs.sh
#
# Enhances all JBrowse config files by adding plugins and hierarchical configuration.
#

set -euo pipefail

source "$(dirname "$0")/common.sh"

# --- Functions ---

# Processes a single assembly.
# $1: The assembly directory in the results folder.
process_assembly() {
  local assembly_results_dir=$1
  local assembly_name
  assembly_name=$(basename "$assembly_results_dir")

  # Skip non-assembly directories
  if [[ "$assembly_name" == "trix" ]]; then
    return 0
  fi

  local config_path="$assembly_results_dir/config.json"

  if [ ! -f "$config_path" ]; then
    echo "Warning: config.json not found for $assembly_name, skipping..."
    return
  fi

  node src/enhanceConfig.ts "$config_path"
}

export -f process_assembly
export UCSC_RESULTS_DIR

# --- Main Script ---

# Run the process_assembly function in parallel for each directory in UCSC_RESULTS_DIR.
parallel $PARALLEL_OPTS process_assembly ::: "$UCSC_RESULTS_DIR"/*
