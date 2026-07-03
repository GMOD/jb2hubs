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
  # GNU parallel runs exported functions in a fresh bash without the parent's
  # `set -euo pipefail`; fail fast so a failed step never reaches
  # save_rebuild_stamp and caches a broken track (see createGeneTracks for why).
  set -eo pipefail
  local assembly_data_dir=$1
  local assembly_name
  assembly_name=$(basename "$assembly_data_dir")
  local assembly_results_dir="$UCSC_BUILT_DIR/$assembly_name"
  local db_dir="$assembly_data_dir/$assembly_name/database"

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
          ./sortIfNeeded.sh "${outfile}.tmp" | bgzip -@2 >"${outfile}.bed.gz"
          tabix -p bed -C "${outfile}.bed.gz"
          rm -f "${outfile}.tmp"
          save_rebuild_stamp "${infile}.txt.gz" "$hash_file"
        fi
      fi
    done
  fi
}

export -f process_assembly
export UCSC_BUILT_DIR

# --- Main Script ---

if [ $# -eq 0 ]; then
  echo "Usage: $0 <assembly_data_dir1> [assembly_data_dir2] ..."
  exit 1
fi

parallel $PARALLEL_OPTS process_assembly ::: "$@" ||
  echo "WARNING: parallel reported failures while creating RepeatMasker tracks (exit $?)" >&2
