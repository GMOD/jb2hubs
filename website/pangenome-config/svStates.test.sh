#!/bin/bash
#
# svStates.test.sh
#
# Tests for the steps svStates.sh gives every sidecar build: the sidecar it
# writes reads back by region under its haplotypes line, and PUBLISH=0 uploads
# nothing.
# Run: ./svStates.test.sh
#

set -uo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT
# shellcheck source=../../lib/common.sh
source "$here/../../lib/common.sh"
# shellcheck source=svStates.sh
source "$here/svStates.sh"

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

printf 'A#1\nA#2\nB#1\n' >"$tmp/haplotypes.txt"
printf 'chr1\t100\t200\tdel\t1:-1700\t110\t.\nchr2\t300\t301\tins\t1:+6400\t011\t.\n' |
  write_sv_states "$tmp/haplotypes.txt" "$tmp/x.tsv.gz" >"$tmp/log.txt"

check "the first line names the haplotypes" "#haplotypes	A#1,A#2,B#1" \
  "$(gzip -dc "$tmp/x.tsv.gz" | head -1)"
check "a region reads its row back" "chr2	300	301	ins	1:+6400	011	." \
  "$(tabix "$tmp/x.tsv.gz" chr2:301-301)"
check "the log counts rows and haplotypes" "2 records over 3 haplotypes" \
  "$(grep -o '[0-9]* records over [0-9]* haplotypes' "$tmp/log.txt")"
check "no partial file is left" "" "$(ls "$tmp"/*.part 2>/dev/null)"

rclone_copy_with_indexes() { echo "rclone called" >&2; echo 1; }
PUBLISH=0 publish_built "$tmp" "jbrowse-data:jbrowse.org/pangenome/x/sv-states" x \
  >"$tmp/publish.txt" 2>&1
check "PUBLISH=0 uploads nothing" "" "$(grep 'rclone called' "$tmp/publish.txt")"

cloudfront_invalidate() { echo "invalidate $1"; }
check "a changed upload invalidates its own files" "invalidate /pangenome/x/sv-states/x*" \
  "$(publish_built "$tmp" "jbrowse-data:jbrowse.org/pangenome/x/sv-states" x 2>/dev/null | grep invalidate)"

exit $fail
