#!/bin/bash
#
# xenoSymbolIndex.test.sh
#
# Tests for cut_refseq_symbols, the gene2refseq -> accession/symbol cut.
# Run: ./xenoSymbolIndex.test.sh
#

set -uo pipefail
source "$(cd "$(dirname "$0")" && pwd)/xenoSymbolIndex.sh"

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

# gene2refseq's 16 columns, trimmed to what the cut reads: tax_id, GeneID,
# status, RNA accession, then 11 unread columns and Symbol.
g2r_row() {
  printf '%s\t%s\tREVIEWED\t%s\t-\t-\t-\t-\t-\t-\t-\t-\t-\t-\t-\t%s\n' "$1" "$2" "$3" "$4"
}

got=$({
  g2r_row 9606 5080 NM_000280.6 PAX6
  g2r_row 9606 5080 NM_000280.6 PAX6
  g2r_row 10090 18508 NM_013627.4 Pax6
  g2r_row 9606 7157 NR_176326.1 TP53
  g2r_row 9606 7157 XM_011523960.3 TP53
  g2r_row 9606 7157 - TP53
} | cut_refseq_symbols)
check "cut_refseq_symbols keeps NM_/NR_, unversioned, once each" \
  "NM_000280	PAX6
NM_013627	Pax6
NR_176326	TP53" "$got"

exit $fail
