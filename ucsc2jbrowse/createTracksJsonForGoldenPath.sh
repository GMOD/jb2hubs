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

  # tracks.json is the parsed trackDb: the bed/rmsk/gene derivation scripts
  # select tables from it, and src/buildConfigs.ts reads it for the big-file
  # tracks and the track metadata.
  if [[ -f "$db_dir/trackDb.sql" ]]; then
    mkdir -p "$assembly_results_dir"
    node src/tracksDbLike.ts "$db_dir/trackDb.sql" "$db_dir/trackDb.txt.gz" >"$assembly_results_dir/tracks.json"
  fi
}
export -f process_assembly

run_for_assemblies process_assembly "$@"
