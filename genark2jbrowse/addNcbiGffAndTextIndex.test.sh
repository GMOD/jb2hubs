#!/bin/bash
#
# addNcbiGffAndTextIndex.test.sh
#
# Tests for the pure (network-free) helpers in addNcbiGffAndTextIndex.sh.
# Run: ./addNcbiGffAndTextIndex.test.sh
#

set -uo pipefail
source "$(cd "$(dirname "$0")" && pwd)/addNcbiGffAndTextIndex.sh"

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

gff='chr1	RefSeq	CDS	1	100	.	+	0	ID=cds1;transl_table=1
chrM	RefSeq	CDS	1	50	.	+	0	ID=cds2;transl_table=2
chrM	RefSeq	CDS	60	100	.	+	0	ID=cds3;transl_table=2'

got=$(printf '%s\n' "$gff" | extract_genetic_codes)
check "extract_genetic_codes omits standard code 1" \
  "chrM	2" "$got"

# A sequence with no CDS / transl_table at all yields nothing for it.
gff_no_cds='chr1	RefSeq	exon	1	100	.	+	0	ID=exon1'
got=$(printf '%s\n' "$gff_no_cds" | extract_genetic_codes)
check "extract_genetic_codes ignores sequences without a CDS transl_table" "" "$got"

# Ties / mixed codes on one seqid: the most frequent code wins.
gff_mixed='chr2	RefSeq	CDS	1	10	.	+	0	ID=a;transl_table=2
chr2	RefSeq	CDS	20	30	.	+	0	ID=b;transl_table=2
chr2	RefSeq	CDS	40	50	.	+	0	ID=c;transl_table=5'
got=$(printf '%s\n' "$gff_mixed" | extract_genetic_codes)
check "extract_genetic_codes picks the dominant non-standard code" \
  "chr2	2" "$got"

[[ $fail -eq 0 ]] && echo "All tests passed" || echo "Some tests failed"
exit $fail
