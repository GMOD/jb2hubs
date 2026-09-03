#!/bin/bash

#
# createGeneTracksForGoldenPath.sh
#
# Creates gene tracks from the golden path data.
#

set -euo pipefail

source "$(dirname "$0")/common.sh"

# Our vendored fork of bed2gff (see ../bed2gff). Resolve and validate the release
# build once up front so a missing binary fails fast with a clear, actionable
# error instead of dying many tracks into the run.
BED2GFF="$(cd "$(dirname "$0")/../bed2gff" && pwd)/target/release/bed2gff"
if [ ! -x "$BED2GFF" ]; then
  echo "ERROR: bed2gff not built at $BED2GFF" >&2
  echo "       Build it with: pnpm build:bed2gff (or: cd bed2gff && cargo build --release)" >&2
  exit 1
fi
export BED2GFF

process_assembly() {
  # shellcheck disable=SC2034 # assembly_paths sets all three; declaring them
  # keeps the ones this script does not read from leaking out as globals
  local assembly_name assembly_results_dir db_dir
  assembly_paths "$1"

  mkdir -p "$assembly_results_dir"

  # Use jq to extract gene prediction tracks
  jq -r 'to_entries | .[] | select(.value.type | startswith("genePred")) | .key' "$assembly_results_dir/tracks.json" | while read -r key; do
    if is_skipped_track "$key"; then
      continue
    fi

    local infile="$db_dir/$key"
    local outfile="$assembly_results_dir/$key"

    if [ -f "${infile}.sql" ]; then
      mkdir -p "$(dirname "$outfile")"

      local hash_file="${outfile}.hash"
      if needs_rebuild "${outfile}.gff.gz" "${infile}.txt.gz" "$hash_file"; then
        echo "Processing ${key}: file changed or new"
        node src/geneLike.ts "${infile}.sql" "${infile}.txt.gz" | awk -F"\t" 'BEGIN{OFS="\t"} {if ($2 >= $3) {temp=$2; $2=$3; $3=temp} print}' | sort -t$'\t' -k1,1 -k2,2n >"${outfile}.bed"
        # -Ld$'\t': hck splits on \s+ by default, and UCSC ships names that
        # contain spaces (hg16's encodeEgasp* tables name every transcript
        # `transcript_id "ENr231_1";`), which shifts every column after them.
        hck -Ld$'\t' -f 13,4 "${outfile}.bed" >"${outfile}.isoforms.txt"
        node src/fixupIsoforms.ts "${outfile}.isoforms.txt"
        "$BED2GFF" -t1 --bed "${outfile}.bed" --output "${outfile}.gff" --isoforms "${outfile}.isoforms.txt"
        if [ -f "${infile}Link.sql" ]; then
          node src/enhanceGffWithLinkTable.ts "${outfile}.gff" "${infile}Link.txt.gz" "${infile}Link.sql" >"${outfile}.enhanced.gff"
          jbrowse sort-gff "${outfile}.enhanced.gff" | bgzip >"${outfile}.gff.gz"
        else
          jbrowse sort-gff "${outfile}.gff" | bgzip >"${outfile}.gff.gz"
        fi
        rm -f "${outfile}.bed" "${outfile}.isoforms.txt" "${outfile}.enhanced.gff" "${outfile}.gff"

        tabix -C "${outfile}.gff.gz"

        save_rebuild_stamp "${outfile}.gff.gz" "${infile}.txt.gz" "$hash_file"
      fi
    fi
  done
}
export -f process_assembly

run_for_assemblies_lenient process_assembly "creating gene tracks" "$@"
