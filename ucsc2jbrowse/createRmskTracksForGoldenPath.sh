#!/bin/bash

#
# createRmskTracksForGoldenPath.sh
#
# Creates RepeatMasker tracks from the golden path data.
#

set -euo pipefail

source "$(dirname "$0")/common.sh"

process_assembly() {
  # shellcheck disable=SC2034 # assembly_paths sets all three; declaring them
  # keeps the ones this script does not read from leaking out as globals
  local assembly_name assembly_results_dir db_dir
  assembly_paths "$1"

  mkdir -p "$assembly_results_dir"

  if [ -f "$assembly_results_dir/tracks.json" ]; then
    jq -r 'to_entries | .[] | select(.value.type | startswith("rmsk")) | .key' "$assembly_results_dir/tracks.json" | while read -r key; do
      if is_skipped_track "$key"; then
        continue
      fi
      local infile="$db_dir/$key"
      local outfile="$assembly_results_dir/$key"

      if [ -f "${infile}.sql" ]; then
        local hash_file="${outfile}.hash"
        if needs_rebuild "${outfile}.bed.gz" "${infile}.txt.gz" "$hash_file"; then
          node src/rmskLike.ts "${infile}.sql" "${infile}.txt.gz" >"${outfile}.tmp"
          sort_if_needed "${outfile}.tmp" | bgzip -@2 >"${outfile}.bed.gz"
          tabix -p bed -C "${outfile}.bed.gz"
          rm -f "${outfile}.tmp"
          save_rebuild_stamp "${infile}.txt.gz" "$hash_file"
        fi
      fi
    done
  fi
}
export -f process_assembly

run_for_assemblies_lenient process_assembly "creating RepeatMasker tracks" "$@"
