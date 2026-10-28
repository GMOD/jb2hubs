#!/bin/bash

#
# createGeneTracksForGoldenPath.sh
#
# Creates gene tracks from the golden path data.
#

set -euo pipefail

source "$(dirname "$0")/common.sh"

GFF_DIR="$(cd "$(dirname "$0")" && pwd)/gff"
export GFF_DIR

# The ncbiRefSeq family shares one Link table, except Historical, which has its
# own and whose retired accessions NCBI's current GFF does not hold.
link_table() {
  local db_dir="$1" key="$2"
  if [ -f "$db_dir/${key}Link.sql" ]; then
    echo "$db_dir/${key}Link"
  elif [ "$key" = ncbiRefSeqHistorical ] && [ -f "$db_dir/ncbiRefSeqLinkHistorical.sql" ]; then
    echo "$db_dir/ncbiRefSeqLinkHistorical"
  elif [[ "$key" == ncbiRefSeq* ]] && [ -f "$db_dir/ncbiRefSeqLink.sql" ]; then
    echo "$db_dir/ncbiRefSeqLink"
  fi
}
export -f link_table

process_assembly() {
  # shellcheck disable=SC2034 # assembly_paths sets all three; declaring them
  # keeps the ones this script does not read from leaking out as globals
  local assembly_name assembly_results_dir db_dir
  assembly_paths "$1"

  mkdir -p "$assembly_results_dir"
  if [ ! -f "$assembly_results_dir/tracks.json" ]; then
    return 0
  fi

  local ncbi_gff="$GFF_DIR/$assembly_name.gff.gz"

  jq -r 'to_entries | .[] | select(.value.type | startswith("genePred")) | .key' "$assembly_results_dir/tracks.json" |
    derivable_keys "$assembly_name" "$assembly_results_dir/tracks.json" | while read -r key; do
    local infile="$db_dir/$key"
    local outfile="$assembly_results_dir/$key"

    if [ -f "${infile}.sql" ]; then
      mkdir -p "$(dirname "$outfile")"

      local link args=() sources=()
      link=$(link_table "$db_dir" "$key")
      if [ -n "$link" ]; then
        args+=(--link "${link}.sql" "${link}.txt.gz")
        sources+=("${link}.txt.gz")
      fi
      if [[ "$key" == ncbiRefSeq* ]] && [ "$key" != ncbiRefSeqHistorical ] && [ -f "$ncbi_gff.csi" ]; then
        args+=(--ncbi-gff "$ncbi_gff")
        sources+=("$ncbi_gff")
      fi

      local hash_file="${outfile}.hash"
      if needs_rebuild "${outfile}.gff.gz" "${infile}.txt.gz" "$hash_file" "${sources[@]}"; then
        echo "Processing ${key}: file changed or new"
        node src/genePredToGff.ts "${infile}.sql" "${infile}.txt.gz" "${args[@]}" >"${outfile}.gff"
        write_indexed_gz_from "${outfile}.gff.gz" gff "$JBROWSE_CLI" sort-gff "${outfile}.gff"
        rm -f "${outfile}.gff"
        save_rebuild_stamp "${outfile}.gff.gz" "${infile}.txt.gz" "$hash_file" "${sources[@]}"
      fi
    fi
  done
}
export -f process_assembly

run_for_assemblies_lenient process_assembly "creating gene tracks" "$@"
