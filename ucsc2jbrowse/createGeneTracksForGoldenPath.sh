#!/bin/bash

#
# createGeneTracksForGoldenPath.sh
#
# Creates gene tracks from the golden path data.
#

set -euo pipefail

source "$(dirname "$0")/common.sh"

# --- Functions ---

# Processes gene tracks for a single assembly.
# $1: The tracks.json file for the assembly.
# $2: The database directory for the assembly.
# $3: The results directory for the assembly.
process_gene_tracks() {
  local tracks_json=$1
  local db_dir=$2
  local outdir=$3

  # Use jq to extract gene prediction tracks
  jq -r 'to_entries | .[] | select(.value.type | startswith("genePred")) | .key' "$tracks_json" | while read -r key; do
    # Skip wgEncode tracks
    if [[ "$key" == wgEncode* ]]; then
      continue
    fi

    local infile="$db_dir/$key"
    local outfile="$outdir/$key"

    if [ -f "${infile}.sql" ]; then
      mkdir -p "$(dirname "$outfile")"

      local hash_file="${outfile}.hash"
      if needs_rebuild "${outfile}.gff.gz" "${infile}.txt.gz" "$hash_file"; then
        echo "Processing ${key}: file changed or new"
        node src/geneLike.ts "${infile}.sql" "${infile}.txt.gz" | awk -F"\t" 'BEGIN{OFS="\t"} {if ($2 >= $3) {temp=$2; $2=$3; $3=temp} print}' | sort -k1,1 -k2,2n >"${outfile}.bed"
        hck -f 13,4 "${outfile}.bed" >"${outfile}.isoforms.txt"
        node src/fixupIsoforms.ts "${outfile}.isoforms.txt"
        ~/bed2gff -t1 --bed "${outfile}.bed" --output "${outfile}.gff" --isoforms "${outfile}.isoforms.txt"
        if [ -f "${infile}Link.sql" ]; then
          node src/enhanceGffWithLinkTable.ts "${outfile}.gff" "${infile}Link.txt.gz" "${infile}Link.sql" >"${outfile}.enhanced.gff"
          jbrowse sort-gff "${outfile}.enhanced.gff" | bgzip >"${outfile}.gff.gz"
        else
          jbrowse sort-gff "${outfile}.gff" | bgzip >"${outfile}.gff.gz"
        fi
        rm -f "${outfile}.bed" "${outfile}.isoforms.txt" "${outfile}.enhanced.gff" "${outfile}.gff"

        tabix -C "${outfile}.gff.gz"

        save_rebuild_stamp "${infile}.txt.gz" "$hash_file"
      fi
    fi
  done
}

# Processes a single assembly.
# $1: The assembly directory in the data folder.
process_assembly() {
  local assembly_data_dir=$1
  local assembly_name
  assembly_name=$(basename "$assembly_data_dir")
  local assembly_results_dir="$UCSC_BUILT_DIR/$assembly_name"
  local db_dir="$assembly_data_dir/$assembly_name/database"

  mkdir -p "$assembly_results_dir"
  process_gene_tracks "$assembly_results_dir/tracks.json" "$db_dir" "$assembly_results_dir"
}

export -f process_assembly
export -f process_gene_tracks
export UCSC_BUILT_DIR

# --- Main Script ---

if [ $# -eq 0 ]; then
  echo "Usage: $0 <assembly_data_dir1> [assembly_data_dir2] ..."
  exit 1
fi

parallel $PARALLEL_OPTS --will-cite process_assembly ::: "$@"
