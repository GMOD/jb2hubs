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
  # GNU parallel runs exported functions in a fresh bash without the parent's
  # `set -euo pipefail`; fail fast so a failed track-adding step doesn't leave a
  # half-written config.json (a reprocess rebuilds config.json from scratch, so
  # aborting here is self-healing).
  set -eo pipefail
  local assembly_data_dir=$1
  local assembly_name
  assembly_name=$(basename "$assembly_data_dir")
  local assembly_results_dir="$UCSC_BUILT_DIR/$assembly_name"
  local config="$assembly_results_dir/config.json"

  # nullglob so an assembly with no bed/gff tracks yields an empty list rather
  # than a literal "*.bed.gz" path. Each script reads and rewrites config.json
  # once for the whole batch, instead of a node startup + full rewrite per file.
  shopt -s nullglob
  local bed_files=("$assembly_results_dir"/*.bed.gz)
  local gff_files=("$assembly_results_dir"/*.gff.gz)
  shopt -u nullglob

  if [ "${#bed_files[@]}" -gt 0 ]; then
    node src/addBedTabixTrackToConfig.ts "$config" "${bed_files[@]}"
  fi
  if [ "${#gff_files[@]}" -gt 0 ]; then
    node src/addGffTabixTrackToConfig.ts "$config" "${gff_files[@]}"
  fi

  # Optional: remove older copies of tracks, e.g. older dbSnp, older GENCODE, etc.
  node src/removeEverythingButLatest.ts "$config"
}

export -f process_assembly
export UCSC_BUILT_DIR

# --- Main Script ---

if [ $# -eq 0 ]; then
  echo "Usage: $0 <assembly_data_dir1> [assembly_data_dir2] ..."
  exit 1
fi

# Run the process_assembly function in parallel for each input directory.
parallel $PARALLEL_OPTS process_assembly ::: "$@"
