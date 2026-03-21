#!/bin/bash

#
# createTracksJsonForGoldenPath.sh
#
# Creates the tracks.json file for each assembly.
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
  local db_dir="$assembly_data_dir/$assembly_name/database"

  if [[ -f "$db_dir/trackDb.sql" ]]; then
    node src/tracksDbLike.ts "$db_dir/trackDb.sql" "$db_dir/trackDb.txt.gz" >"$assembly_results_dir/tracks.json"

    # Find bigBed/bigWig files in the tracks.json, these do not have sql db files
    node src/mergeBigFileTracks.ts "$assembly_results_dir/tracks.json" "$assembly_results_dir/config.json"
  fi
}

export -f process_assembly
export UCSC_BUILT_DIR

# --- Main Script ---

if [ $# -eq 0 ]; then
  echo "Usage: $0 <assembly_data_dir1> [assembly_data_dir2] ..."
  exit 1
fi

parallel $PARALLEL_OPTS --will-cite process_assembly ::: "$@"
