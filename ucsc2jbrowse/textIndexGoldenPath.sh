#!/bin/bash

#
# textIndexGoldenPath.sh
#
# Creates a text index for each assembly.
#

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
source "$SCRIPT_DIR/common.sh"

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

  # Check if the ncbiRefSeq track exists in config.json
  if ! grep -q "\"${assembly_name}-ncbiRefSeq\"" "$assembly_results_dir/config.json" 2>/dev/null; then
    echo "Skipping text index for $assembly_name (no ncbiRefSeq track)"
    return 0
  fi

  echo "Creating text index for $assembly_name..."
  if ! jbrowse text-index --out "$assembly_results_dir" --force --tracks "$assembly_name-ncbiRefSeq" --attributes ID,Name,gene_synonym; then
    echo "Warning: text-index failed for $assembly_name" >&2
  fi
}

export -f process_assembly
export UCSC_BUILT_DIR

# --- Main Script ---

if [ $# -eq 0 ]; then
  echo "Usage: $0 <assembly_results_dir1> [assembly_results_dir2] ..."
  exit 1
fi

# Run the process_assembly function in parallel for each input directory. Don't
# let individual job failures stop the pipeline, but surface the failure count.
parallel -j8 $PARALLEL_OPTS --halt never process_assembly ::: "$@" ||
  echo "WARNING: parallel reported failures during text indexing (exit $?)" >&2
