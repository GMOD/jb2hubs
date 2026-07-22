#!/bin/bash

#
# textIndexGoldenPath.sh
#
# Creates a text index for each assembly. Takes built directories, not download
# directories.
#

set -euo pipefail

source "$(dirname "$0")/common.sh"

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
  else
    echo "Creating text index for $assembly_name..."
    if ! jbrowse text-index --out "$assembly_results_dir" --force --tracks "$assembly_name-ncbiRefSeq" --attributes ID,Name,gene_synonym; then
      echo "Warning: text-index failed for $assembly_name" >&2
    fi
  fi
}
export -f process_assembly

# text-index is memory-hungry, so cap concurrency well below core count.
# shellcheck disable=SC2034 # read by run_for_assemblies_lenient in common.sh
PARALLEL_JOBS=8
run_for_assemblies_lenient process_assembly "text indexing" "$@"
