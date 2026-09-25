#!/bin/bash
#
# downloadNcbiGff.test.sh
#
# Tests for downloadNcbiGff.sh's fetch_ncbi_gff against a stub curl, and for
# staleNcbiGffs.ts over a fixture tree. No network.
# Run: ./downloadNcbiGff.test.sh
#

set -uo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
source "$here/downloadNcbiGff.sh"

fail=0
check() {
  local desc="$1" expected="$2" actual="$3"
  if [[ "$expected" == "$actual" ]]; then
    echo "ok   - $desc"
  else
    echo "FAIL - $desc"
    echo "       expected: $expected"
    echo "       actual:   $actual"
    fail=1
  fi
}

tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT
cd "$tmp" || exit 1
mkdir gff bgz

# Answers as NCBI would, per $STUB, and records its arguments.
curl() {
  local out="" prev="" arg
  for arg in "$@"; do
    if [ "$prev" = -o ]; then
      out=$arg
    fi
    prev=$arg
  done
  printf '%s\n' "$*" >"$tmp/curl.args"
  case "$STUB" in
    new) printf 'new release\n' >"$out" && printf 200 ;;
    unchanged) printf 304 ;;
    truncated) printf 'new rel' >"$out" && printf 200 && return 18 ;;
    gone) printf '<html>not found</html>' >"$out" && printf 404 ;;
    down) printf 503 ;;
  esac
}

f=GCF_1.1_a_genomic.gff.gz
line="https://ftp.example.org/$f|thing|$f"

STUB=new fetch_ncbi_gff "$line" >/dev/null
check "a GFF we do not have is fetched" "new release" "$(cat gff/$f)"
check "and asked for unconditionally" "no" \
  "$(grep -q -- ' -z ' "$tmp/curl.args" && echo yes || echo no)"

echo 'old release' >gff/$f
touch -d 2025-07-03 gff/$f
touch -d 2026-07-21 bgz/$f
STUB=unchanged fetch_ncbi_gff "$line" >/dev/null
check "a GFF we have is asked for conditionally" "yes" \
  "$(grep -q -- "-z gff/$f" "$tmp/curl.args" && echo yes || echo no)"
check "a 304 leaves it alone" "old release" "$(cat gff/$f)"
check "and leaves no temp file" "" "$(find gff -name '*.tmp')"

STUB=truncated fetch_ncbi_gff "$line" >/dev/null 2>&1
check "a transfer cut short leaves the old copy" "old release" "$(cat gff/$f)"
check "and no temp file" "" "$(find gff -name '*.tmp')"

STUB=down fetch_ncbi_gff "$line" >/dev/null 2>&1
check "a 5xx records nothing" "no" "$([ -f gff/$f.notfound ] && echo yes || echo no)"

STUB=new fetch_ncbi_gff "$line" >/dev/null
check "a re-annotation replaces it" "new release" "$(cat gff/$f)"
check "newer than the bgz/ built after upstream's date, so it is processed" \
  "yes" "$([ gff/$f -nt bgz/$f ] && echo yes || echo no)"

STUB=gone fetch_ncbi_gff "$line" >/dev/null 2>&1
check "a 404 is recorded" "yes" "$([ -f gff/$f.notfound ] && echo yes || echo no)"
check "without touching the copy we have" "new release" "$(cat gff/$f)"
rm gff/*

# staleNcbiGffs.ts: which downloads NCBI has since re-annotated.
header() {
  printf '##gff-version 3\n#!annotation-source %s\nchr1\t.\tgene\t1\t2\t.\t+\t.\tID=a\n' "$1" | gzip
}
report() {
  local acc="$1" name="$2" dir
  dir=hubs/GCF/${acc:4:3}/${acc:7:3}/${acc:10:3}/$acc
  mkdir -p "$dir"
  printf '{"reports":[{"accession":"%s","annotation_info":{"name":"%s"}}]}' \
    "$acc" "$name" >"$dir/ncbi.json"
}
header 'NCBI RefSeq GCF_000092205.1-RS_2025_07_03' >gff/GCF_000092205.1_A_genomic.gff.gz
report GCF_000092205.1 'GCF_000092205.1-RS_2026_07_03'
header 'NCBI RefSeq GCF_000190015.1-RS_2025_12_08' >gff/GCF_000190015.1_B_genomic.gff.gz
report GCF_000190015.1 'GCF_000190015.1-RS_2024_10_21'
header 'NCBI Bos taurus Annotation Release 106' >gff/GCF_002263795.1_C_genomic.gff.gz
report GCF_002263795.1 'Annotation submitted by NCBI RefSeq'
header 'NCBI RefSeq GCF_000001405.40-RS_2025_08' >gff/GCF_000001405.40_D_genomic.gff.gz
printf 'not gzip' >gff/GCF_000001635.27_E_genomic.gff.gz

got=$(node "$here/src/staleNcbiGffs.ts" 2>"$tmp/stale.err")
check "staleNcbiGffs.ts lists only the GFF NCBI has since re-annotated" \
  "GCF_000092205.1_A_genomic.gff.gz" "$got"
check "and counts the one it could not read" "yes" \
  "$(grep -q '1 would not decompress' "$tmp/stale.err" && echo yes || echo no)"

exit $fail
