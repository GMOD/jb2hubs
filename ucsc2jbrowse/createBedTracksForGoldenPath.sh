#!/bin/bash

#
# createBedTracksForGoldenPath.sh
#
# Creates BED tracks from the golden path data.
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

  if [ -f "$assembly_results_dir/tracks.json" ]; then
    # Process each track that matches our types
    jq -r 'to_entries | map(select(.value.type | startswith("bed") or startswith("pgSnp") or startswith("peptideMapping"))) | map(.key) | .[]' "$assembly_results_dir/tracks.json" | while read -r key; do
      # Skip tracks that start with "snp" or "wgEncode" (these are large and numerous)
      if [[ "$key" == snp* ]] || [[ "$key" == wgEncode* ]]; then
        continue
      fi

      local infile="$db_dir/$key"
      local outfile="$assembly_results_dir/$key"

      if [ -f "${infile}.sql" ]; then
        local hash_file="${outfile}.hash"
        local current_stat
        current_stat=$(stat -c "%s" "${infile}.txt.gz")

        local need_processing=true
        if [ -f "${outfile}.bed.gz" ] && [ -f "$hash_file" ] && [ -z "${REPROCESS:-}" ]; then
          local stored_stat
          stored_stat=$(cat "$hash_file")
          if [ "$current_stat" = "$stored_stat" ]; then
            need_processing=false
          fi
        fi

        if [ "$need_processing" = true ]; then
          local result
          result=$(node src/bedLike.ts "${infile}.sql" 2>&1)
          local header
          header=$(echo "$result" | { grep -v "^no_bin$" || true; })

          if echo "$result" | grep -q "no_bin"; then
            (echo "$header" && pigz -dc "${infile}.txt.gz") >"${outfile}.tmp"
          else
            (echo "$header" && pigz -dc "${infile}.txt.gz" | hck -Ld$'\t' -f2-) >"${outfile}.tmp"
          fi
          ./sortIfNeeded.sh "${outfile}.tmp" | bgzip -@2 >"${outfile}.bed.gz"
          tabix -p bed -C "${outfile}.bed.gz"
          echo "$current_stat" >"$hash_file"
          rm -f "${outfile}.tmp"
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

# Run the process_assembly function in parallel for each input directory.
parallel $PARALLEL_OPTS --will-cite process_assembly ::: "$@"
