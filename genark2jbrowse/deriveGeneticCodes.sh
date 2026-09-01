#!/bin/bash
#
# deriveGeneticCodes.sh
#
# Writes bgz/<gff>.codes.tsv beside each processed NCBI GFF: one "seqid<TAB>code"
# row per sequence whose CDS features carry a non-standard transl_table, so the
# reference sequence track translates organelle contigs (mitochondria,
# transl_table=2) with the right code. A pure function of the GFF, derived once
# here and read by buildConfigsBatch.ts, rather than re-scanned from the 100 MB
# file on every config build. The file is written even when empty, so its
# presence means "derived", not "has codes".
#
# Optional first arg: a file listing accessions (one per line) to restrict the
# work to. When omitted, every GFF under bgz/ is considered.

set -euo pipefail

source "$(dirname "$0")/common.sh"

SCOPE_FILE="${1:-}"

# Reads a GFF on stdin and prints, per sequence, the dominant non-standard NCBI
# genetic code as "seqid<TAB>code". The standard code (1) and sequences without
# a CDS transl_table are omitted, so the typical nuclear assembly produces no
# output at all.
extract_genetic_codes() {
  awk -F'\t' '
    $3 == "CDS" && match($9, /transl_table=[0-9]+/) {
      code = substr($9, RSTART + 13, RLENGTH - 13)
      count[$1 SUBSEP code]++
      seqids[$1] = 1
    }
    END {
      for (seqid in seqids) {
        best = ""
        best_count = 0
        for (key in count) {
          split(key, parts, SUBSEP)
          if (parts[1] == seqid && count[key] > best_count) {
            best_count = count[key]
            best = parts[2]
          }
        }
        if (best != "" && best != "1") {
          print seqid "\t" best
        }
      }
    }'
}
export -f extract_genetic_codes

derive_codes() {
  set -eo pipefail
  local gff="$1" out="$1.codes.tsv"
  pigz -dc "$gff" | extract_genetic_codes >"$out.tmp"
  mv "$out.tmp" "$out"
}
export -f derive_codes

# Skip when sourced (by the test script) so only the functions are loaded.
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
  list_scoped_gz bgz "$SCOPE_FILE" | grep '\.gff\.gz$' |
    while IFS= read -r gff; do
      if [ -n "${REPROCESS:-}" ] || [ ! -f "$gff.codes.tsv" ] || [ "$gff" -nt "$gff.codes.tsv" ]; then
        echo "$gff"
      fi
    done | run_parallel_reporting 'genetic codes' -j16 derive_codes
fi
