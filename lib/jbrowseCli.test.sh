#!/bin/bash
#
# lib/jbrowseCli.test.sh
#
# Runs the pinned JBrowse CLI (JBROWSE_CLI) through every command the
# pipelines call, on fixtures small enough for CI: --version, sort-gff,
# make-pif and text-index, the last through both textIndex.sh scripts. The CLI
# resolves its own @jbrowse/* dependencies by semver range, so a lockfile change
# can break it with package.json untouched; on 2026-10-09 one did, and every
# UCSC text index failed for five days before anyone looked.
# Needs `pnpm install`, GNU parallel and gzip.
# Run: ./lib/jbrowseCli.test.sh
#

set -uo pipefail
repo=$(cd "$(dirname "$0")/.." && pwd)
source "$repo/lib/common.sh"

fail=0
check() {
  local desc="$1" expected="$2" actual="$3"
  if [[ "$expected" == "$actual" ]]; then
    echo "ok   - $desc"
  else
    echo "FAIL - $desc (expected '$expected', got '$actual')"
    fail=1
  fi
}

tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT

gff_row() {
  printf '%s\tRefSeq\tgene\t%s\t%s\t.\t+\t.\tID=%s;Name=%s;gene_synonym=%s\n' "$@"
}
{
  printf '##gff-version 3\n'
  gff_row chr1 5000 6000 gene-PAX6 PAX6 AN2
  gff_row chr1 100 900 gene-TP53 TP53 LFS1
} >"$tmp/unsorted.gff"

version=$("$JBROWSE_CLI" --version)
check "--version exits 0" 0 "$?"
check "--version names the build" 0 "$([ -n "$version" ] && echo 0 || echo 1)"

"$JBROWSE_CLI" sort-gff "$tmp/unsorted.gff" >"$tmp/sorted.gff"
check "sort-gff exits 0" 0 "$?"
check "sort-gff orders genes by start" "TP53 PAX6" \
  "$(grep -v '^#' "$tmp/sorted.gff" | sed 's/.*Name=\([^;]*\).*/\1/' | paste -sd' ')"

printf 'q1\t1000\t0\t1000\t+\tt1\t1000\t0\t1000\t1000\t1000\t60\tcg:Z:1000M\n' >"$tmp/chain.paf"
"$JBROWSE_CLI" make-pif "$tmp/chain.paf" --csi --out "$tmp/chain.pif.gz" >/dev/null 2>&1
check "make-pif exits 0" 0 "$?"
check "make-pif writes a CSI index" 0 "$([ -s "$tmp/chain.pif.gz.csi" ] && echo 0 || echo 1)"
check "make-pif writes both strands of the record" "qq1 tt1" \
  "$(gzip -dc "$tmp/chain.pif.gz" | cut -f1 | grep -E '^(qq1|tt1)$' | sort | paste -sd' ')"

gzip -c "$tmp/sorted.gff" >"$tmp/genes.gff.gz"

# A config holding one gene track over the fixture, named the way each pipeline
# names its indexed track.
write_config() {
  local dir="$1" asm="$2" track="$3"
  mkdir -p "$dir"
  cp "$tmp/genes.gff.gz" "$dir/genes.gff.gz"
  cat >"$dir/config.json" <<EOF
{
  "assemblies": [
    {
      "name": "$asm",
      "sequence": {
        "type": "ReferenceSequenceTrack",
        "trackId": "$asm-ReferenceSequenceTrack",
        "adapter": { "type": "TwoBitAdapter", "uri": "$asm.2bit" }
      }
    }
  ],
  "tracks": [
    {
      "type": "FeatureTrack",
      "trackId": "$track",
      "name": "Genes",
      "assemblyNames": ["$asm"],
      "adapter": {
        "type": "Gff3TabixAdapter",
        "gffGzLocation": { "uri": "genes.gff.gz" },
        "index": { "location": { "uri": "genes.gff.gz.tbi" } }
      }
    }
  ]
}
EOF
}

ucsc="$tmp/ucsc/fake1"
write_config "$ucsc" fake1 fake1-ncbiRefSeq
printf '%s\t%s\n' "$ucsc" fake1-ncbiRefSeq | "$repo/ucsc2jbrowse/textIndex.sh" >/dev/null 2>"$tmp/ucsc.err"
check "ucsc2jbrowse/textIndex.sh exits 0" 0 "$?"
check "the UCSC index finds a gene by name" 1 "$(grep -c '^tp53 ' "$ucsc/trix/fake1.ix" 2>/dev/null)"
check "the UCSC index finds a gene by gene_synonym" 1 "$(grep -c '^an2 ' "$ucsc/trix/fake1.ix" 2>/dev/null)"
check "the UCSC index writes its meta file" 0 "$([ -s "$ucsc/trix/fake1_meta.json" ] && echo 0 || echo 1)"

acc=GCF_000000001.1
genark="$tmp/genark/$acc"
write_config "$genark" "$acc" "$acc-ncbiGff"
printf '%s\n' "$genark" | "$repo/genark2jbrowse/textIndex.sh" >/dev/null 2>"$tmp/genark.err"
check "genark2jbrowse/textIndex.sh exits 0" 0 "$?"
check "the GenArk index finds a gene by name" 1 "$(grep -c '^pax6 ' "$genark/trix/$acc.ix" 2>/dev/null)"

if [ "$fail" -ne 0 ]; then
  echo "--- textIndex.sh stderr ---"
  cat "$tmp/ucsc.err" "$tmp/genark.err"
fi
exit $fail
