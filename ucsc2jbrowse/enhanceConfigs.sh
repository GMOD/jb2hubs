#!/bin/bash

#
# enhanceConfigs.sh
#
# Enhances all JBrowse config files by adding plugins and hierarchical configuration.
#

set -euo pipefail

# --- Configuration ---

: ${UCSC_RESULTS_DIR:=~/ucscResults}

export LC_ALL=C

# --- Functions ---

# Processes a single assembly.
# $1: The assembly directory in the results folder.
process_assembly() {
  local assembly_results_dir=$1
  local assembly_name
  assembly_name=$(basename "$assembly_results_dir")
  local config_path="$assembly_results_dir/config.json"

  if [ ! -f "$config_path" ]; then
    echo "Warning: config.json not found for $assembly_name, skipping..."
    return
  fi

  echo "Enhancing config for $assembly_name..."
  node src/enhanceConfig.ts "$config_path"
}

export -f process_assembly
export UCSC_RESULTS_DIR

# --- Main Script ---

# Run the process_assembly function in parallel for each directory in UCSC_RESULTS_DIR.
parallel $PARALLEL_OPTS process_assembly ::: "$UCSC_RESULTS_DIR"/*
