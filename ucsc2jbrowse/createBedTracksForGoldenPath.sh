#!/bin/bash

#
# createBedTracksForGoldenPath.sh
#
# Creates BED tracks from the golden path data.
#

set -euo pipefail

source "$(dirname "$0")/common.sh"

process_assembly() {
  # shellcheck disable=SC2034 # assembly_paths sets all three; declaring them
  # keeps the ones this script does not read from leaking out as globals
  local assembly_name assembly_results_dir db_dir
  assembly_paths "$1"

  if [ -f "$assembly_results_dir/tracks.json" ]; then
    # Process each track that matches our types
    jq -r 'to_entries | map(select(.value.type | startswith("bed") or startswith("pgSnp") or startswith("peptideMapping"))) | map(.key) | .[]' "$assembly_results_dir/tracks.json" | while read -r key; do
      if is_skipped_track "$key"; then
        continue
      fi

      local infile="$db_dir/$key"
      local outfile="$assembly_results_dir/$key"

      if [ -f "${infile}.sql" ]; then
        local hash_file="${outfile}.hash"
        if needs_rebuild "${outfile}.bed.gz" "${infile}.txt.gz" "$hash_file"; then
          local result
          result=$(node src/bedLike.ts "${infile}.sql" 2>&1)
          local header
          header=$(echo "$result" | { grep -v "^no_bin$" || true; })

          if echo "$result" | grep -q "no_bin"; then
            (echo "$header" && pigz -dc "${infile}.txt.gz") >"${outfile}.tmp"
          else
            (echo "$header" && pigz -dc "${infile}.txt.gz" | hck -Ld$'\t' -f2-) >"${outfile}.tmp"
          fi
          sort_if_needed "${outfile}.tmp" | bgzip -@2 >"${outfile}.bed.gz"
          tabix -p bed -C "${outfile}.bed.gz"
          save_rebuild_stamp "${infile}.txt.gz" "$hash_file"
          rm -f "${outfile}.tmp"
        fi
      fi
    done
  fi
}
export -f process_assembly

run_for_assemblies_lenient process_assembly "creating BED tracks" "$@"
