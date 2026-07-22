#!/bin/bash

#
# createTracksJsonForGoldenPath.sh
#
# Creates the tracks.json file for each assembly.
#

set -euo pipefail

source "$(dirname "$0")/common.sh"

process_assembly() {
  # shellcheck disable=SC2034 # assembly_paths sets all three; declaring them
  # keeps the ones this script does not read from leaking out as globals
  local assembly_name assembly_results_dir db_dir
  assembly_paths "$1"

  if [[ -f "$db_dir/trackDb.sql" ]]; then
    node src/tracksDbLike.ts "$db_dir/trackDb.sql" "$db_dir/trackDb.txt.gz" >"$assembly_results_dir/tracks.json"

    # Find bigBed/bigWig files in the tracks.json, these do not have sql db files
    node src/mergeBigFileTracks.ts "$assembly_results_dir/tracks.json" "$assembly_results_dir/config.json"
  fi
}
export -f process_assembly

run_for_assemblies process_assembly "$@"
