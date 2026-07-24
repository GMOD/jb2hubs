#!/bin/bash

#
# createConfigsForGoldenPath.sh
#
# Creates the JBrowse configuration for each assembly.
#

set -euo pipefail

source "$(dirname "$0")/common.sh"

process_assembly() {
  # shellcheck disable=SC2034 # assembly_paths sets all three; declaring them
  # keeps the ones this script does not read from leaking out as globals
  local assembly_name assembly_results_dir db_dir gff_file
  assembly_paths "$1"
  local config="$assembly_results_dir/config.json"

  # nullglob so an assembly with no bed/gff tracks yields an empty list rather
  # than a literal "*.bed.gz" path. Each script reads and rewrites config.json
  # once for the whole batch, instead of a node startup + full rewrite per file.
  shopt -s nullglob
  local bed_files=("$assembly_results_dir"/*.bed.gz)
  # Skip "<db>.gff.gz": that name is reserved for the NCBI RefSeq copy that
  # downloadNcbiGff.sh drops into the build dir with --load copy and registers
  # itself as <db>-ncbiRefSeqGff. Without this guard the generic adder mints a
  # second, category-less <db>-<db> track pointing at the same file.
  local gff_files=()
  for gff_file in "$assembly_results_dir"/*.gff.gz; do
    if [ "$(basename "$gff_file")" != "$assembly_name.gff.gz" ]; then
      gff_files+=("$gff_file")
    fi
  done
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

run_for_assemblies process_assembly "$@"
