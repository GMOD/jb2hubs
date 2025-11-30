#!/bin/bash

#
# textIndexGoldenPath.sh
#
# Creates a text index for each assembly.
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

  echo "Creating text index for $assembly_name..."
  jbrowse text-index --out "$assembly_results_dir" --force --tracks "$assembly_name-ncbiRefSeq" --attributes ID,Name,gene_synonym
}

export -f process_assembly
export UCSC_RESULTS_DIR

# --- Main Script ---

if [ $# -eq 0 ]; then
  echo "Usage: $0 <assembly_results_dir1> [assembly_results_dir2] ..."
  exit 1
fi

# Run the process_assembly function in parallel for each input directory.
parallel -j8 $PARALLEL_OPTS --will-cite process_assembly ::: "$@"
