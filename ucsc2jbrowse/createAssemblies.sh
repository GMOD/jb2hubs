#!/bin/bash

#
# createAssemblies.sh
#
# Creates the initial JBrowse configuration file for each assembly.
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
  local assembly_results_dir="$UCSC_BUILT_DIR/$assembly_name"

  mkdir -p "$assembly_results_dir"
  node src/createAssembly.ts "$assembly_name" "$UCSC_BUILT_DIR/list.json" >"$assembly_results_dir/config.json"
}

export -f process_assembly
export UCSC_BUILT_DIR

# --- Main Script ---

if [ $# -eq 0 ]; then
  echo "Usage: $0 <assembly_data_dir1> [assembly_data_dir2] ..."
  exit 1
fi

# Use GNU parallel to process assemblies in parallel.
parallel $PARALLEL_OPTS process_assembly ::: "$@"
