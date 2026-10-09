#!/bin/bash
#
# deriveCircularSeqids.sh
#
# Writes bgz/<gff>.circular.txt beside each processed NCBI GFF: one seqid per
# line for each sequence its `region` record marks Is_circular=true (a
# mitochondrion, a plastid, a plasmid, most bacterial chromosomes), so the
# config's assembly lists it in circularRefNames and the circular view closes
# it into a ring. A pure function of the GFF, derived once here and read by
# buildConfigsBatch.ts. The file is written even when empty, so its presence
# means "derived", not "has circular sequences".

set -euo pipefail

source "$(dirname "$0")/common.sh"

# Reads a GFF on stdin and prints each seqid whose region record carries
# Is_circular=true, once, in file order. The fixed-string grep drops every
# other line before awk splits fields, since a nuclear GFF has millions of
# feature lines and only a handful of region records.
extract_circular_seqids() {
  grep -F 'Is_circular=true' |
    awk -F'\t' '$3 == "region" && $9 ~ /(^|;)Is_circular=true(;|$)/ && !seen[$1]++ { print $1 }' ||
    true
}
export -f extract_circular_seqids

derive_circular() {
  set -eo pipefail
  local gff="$1" out="$1.circular.txt"
  pigz -dc "$gff" | extract_circular_seqids >"$out.tmp"
  mv "$out.tmp" "$out"
}
export -f derive_circular

# Skip when sourced (by the test script) so only the functions are loaded.
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
  find bgz -name "*.gff.gz" |
    while IFS= read -r gff; do
      if [ -n "${REPROCESS:-}" ] || [ ! -f "$gff.circular.txt" ] || [ "$gff" -nt "$gff.circular.txt" ]; then
        echo "$gff"
      fi
    done | run_parallel_reporting 'circular seqids' -j16 derive_circular
fi
