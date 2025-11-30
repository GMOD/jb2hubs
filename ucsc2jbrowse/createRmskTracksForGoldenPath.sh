#!/bin/bash

#
# createRmskTracksForGoldenPath.sh
#
# Creates RepeatMasker tracks from the golden path data.
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
  local assembly_results_dir="$UCSC_RESULTS_DIR/$assembly_name"
  local db_dir="$assembly_data_dir/$assembly_name/database"

  mkdir -p "$assembly_results_dir"

  if [ -f "$assembly_results_dir/tracks.json" ]; then
    local keys
    keys=$(jq -r 'to_entries | .[] | select(.value.type | startswith("rmsk")) | .key' "$assembly_results_dir/tracks.json")

    for key in $keys; do
      local infile="$db_dir/$key"
      local outfile="$assembly_results_dir/$key"

      if [ -f "${infile}.sql" ]; then
        local hash_file="${outfile}.hash"
        local current_hash
        current_hash=$(xxh128sum "${infile}.txt.gz" | awk '{print $1}')

        local need_processing=true
        if [ -f "${outfile}.bed.gz" ] && [ -f "$hash_file" ] && [ -z "${REPROCESS}" ]; then
          local stored_hash
          stored_hash=$(cat "$hash_file")
          if [ "$current_hash" = "$stored_hash" ]; then
            need_processing=false
          fi
        fi

        if [ "$need_processing" = true ]; then
          node src/rmskLike.ts "${infile}.sql" "${infile}.txt.gz" >"${outfile}.tmp"
          ./sortIfNeeded.sh "${outfile}.tmp" | bgzip -@2 >"${outfile}.bed.gz"
          tabix -p bed -C "${outfile}.bed.gz"
          rm -f "${outfile}.tmp"
          echo "$current_hash" >"$hash_file"
        fi
      fi
    done
  fi
}

export -f process_assembly
export UCSC_RESULTS_DIR

# --- Main Script ---

if [ $# -eq 0 ]; then
  echo "Usage: $0 <assembly_data_dir1> [assembly_data_dir2] ..."
  exit 1
fi

parallel $PARALLEL_OPTS --will-cite process_assembly ::: "$@"
