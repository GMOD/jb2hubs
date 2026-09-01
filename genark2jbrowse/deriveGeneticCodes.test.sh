#!/bin/bash
#
# deriveGeneticCodes.test.sh
#
# Tests for the pure (network-free) helpers in deriveGeneticCodes.sh.
# Run: ./deriveGeneticCodes.test.sh
#

set -uo pipefail
source "$(cd "$(dirname "$0")" && pwd)/deriveGeneticCodes.sh"

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

# derive_codes writes the sidecar even when there are no codes, so presence
# means "derived" rather than "has codes".
tmp=$(mktemp -d)
printf '%s\n' "$gff_no_cds" | pigz >"$tmp/x.gff.gz"
derive_codes "$tmp/x.gff.gz"
check "derive_codes writes an empty sidecar for a GFF without codes" \
  "yes" "$([ -f "$tmp/x.gff.gz.codes.tsv" ] && [ ! -s "$tmp/x.gff.gz.codes.tsv" ] && echo yes)"
printf '%s\n' "$gff" | pigz >"$tmp/y.gff.gz"
derive_codes "$tmp/y.gff.gz"
check "derive_codes writes the codes it finds" "chrM	2" "$(cat "$tmp/y.gff.gz.codes.tsv")"
rm -rf "$tmp"

[[ $fail -eq 0 ]] && echo "All tests passed" || echo "Some tests failed"
exit $fail
