#!/bin/bash
#
# deriveCircularSeqids.test.sh
#
# Tests for the pure (network-free) helpers in deriveCircularSeqids.sh.
# Run: ./deriveCircularSeqids.test.sh
#

set -uo pipefail
source "$(cd "$(dirname "$0")" && pwd)/deriveCircularSeqids.sh"

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

gff='NC_000913.3	RefSeq	region	1	4641652	.	+	.	ID=NC_000913.3:1..4641652;Is_circular=true;genome=chromosome
NC_000913.3	RefSeq	gene	190	255	.	+	.	ID=gene-b0001;Name=thrL
NC_000001.11	RefSeq	region	1	248956422	.	+	.	ID=NC_000001.11:1..248956422;chromosome=1
NC_012920.1	RefSeq	region	1	16569	.	+	.	ID=NC_012920.1:1..16569;Is_circular=true;genome=mitochondrion
NC_012920.1	RefSeq	D_loop	16024	17145	.	-	.	ID=id-NC_012920.1:1..16569;note=Is_circular=true'

got=$(printf '%s\n' "$gff" | extract_circular_seqids)
check "extract_circular_seqids lists each region marked Is_circular=true" \
  "NC_000913.3
NC_012920.1" "$got"

gff_linear='NC_045512.2	RefSeq	region	1	29903	.	+	.	ID=NC_045512.2:1..29903;genome=genomic'
got=$(printf '%s\n' "$gff_linear" | extract_circular_seqids)
check "extract_circular_seqids prints nothing for a linear genome" "" "$got"

gff_false='NC_1.1	RefSeq	region	1	9	.	+	.	ID=NC_1.1:1..9;Is_circular=trueish'
got=$(printf '%s\n' "$gff_false" | extract_circular_seqids)
check "extract_circular_seqids matches the whole attribute value" "" "$got"

# derive_circular writes the sidecar even when there are none, so presence
# means "derived" rather than "has circular sequences".
tmp=$(mktemp -d)
printf '%s\n' "$gff_linear" | pigz >"$tmp/x.gff.gz"
derive_circular "$tmp/x.gff.gz"
check "derive_circular writes an empty sidecar for a linear genome" \
  "yes" "$([ -f "$tmp/x.gff.gz.circular.txt" ] && [ ! -s "$tmp/x.gff.gz.circular.txt" ] && echo yes)"
printf '%s\n' "$gff" | pigz >"$tmp/y.gff.gz"
derive_circular "$tmp/y.gff.gz"
check "derive_circular writes the seqids it finds" "NC_000913.3
NC_012920.1" "$(cat "$tmp/y.gff.gz.circular.txt")"
rm -rf "$tmp"

[[ $fail -eq 0 ]] && echo "All tests passed" || echo "Some tests failed"
exit $fail
