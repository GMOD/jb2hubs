#!/bin/bash
#
# collapseSiteAlleles.test.sh
#
# Tests for collapseSiteAlleles.py on synthetic sites, and for
# checkSiteAlleles.py: it must pass the real collapse and fail each sabotaged
# copy, or a green build proves nothing.
# Run: ./collapseSiteAlleles.test.sh
#

set -uo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT

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

python3 -I - >"$tmp/in.vcf" <<'EOF'
def rec(pos, ref_len, alt_len, gts, info='.'):
    return '\t'.join(['chr1', str(pos), '.', 'N' * ref_len, 'N' * alt_len, '.', '.', info, 'GT', *gts])

print('\n'.join([
    '##fileformat=VCFv4.2',
    '##contig=<ID=chr1>',
    '#CHROM\tPOS\tID\tREF\tALT\tQUAL\tFILTER\tINFO\tFORMAT\ta\tb\tc\td',
    # unphased: two members each 0/1 make 1/1
    rec(100, 1, 101, ['0/1', '0/0', '0/0', './.']),
    rec(100, 1, 102, ['0/1', '0/1', '0/0', './.']),
    # a chain: 100, 104, 108 bp insertions, the ends 8% apart
    rec(200, 1, 101, ['1|0', '1|0', '0|0', '.|0'], 'LEN=100'),
    rec(200, 1, 105, ['0|0', '0|1', '0|0', '.|0'], 'LEN=104'),
    rec(200, 1, 109, ['0|0', '0|0', '1|0', '.|0'], 'LEN=108'),
    # deletions of near size, one leaving 120 bp of new sequence behind
    rec(300, 5000, 1, ['1|0', '0|0', '0|0', '0|0'], 'CONFLICT=a'),
    rec(300, 5000, 2, ['0|1', '1|0', '0|0', '0|0'], 'CONFLICT=b'),
    rec(300, 5000, 121, ['0|0', '0|0', '1|0', '0|0']),
    # inversions over one REF, one also carrying 25 kb more
    rec(400, 1000, 1000, ['1|0', '0|0', '0|0', '0|0'], 'INV;SVTYPE=INV'),
    rec(400, 1000, 1003, ['0|0', '1|0', '0|0', '0|0'], 'INV;SVTYPE=INV'),
    rec(400, 1000, 26000, ['0|0', '0|0', '1|0', '0|0'], 'INV;SVTYPE=INV'),
    # an insertion and a deletion of one size at one POS
    rec(500, 101, 1, ['1|0', '0|0', '0|0', '0|0']),
    rec(500, 101, 201, ['0|0', '1|0', '0|0', '0|0']),
]))
EOF

python3 -I "$here/collapseSiteAlleles.py" "$tmp/members.tsv" <"$tmp/in.vcf" >"$tmp/out.vcf"
records() { grep -v '^#' "$tmp/out.vcf" | awk -F'\t' -v p="$1" '$2 == p'; }
gts() { cut -f10- | tr '\t' ' '; }

check "two unphased 0/1 members merge to 1/1" "1/1 0/1 0/0 ./." "$(records 100 | gts)"
check "a chain of insertions splits where it outruns 5% of its smallest" \
  "2 1" "$(records 200 | awk -F'\t' '{print ($8 ~ /NumCollapsed=2/ ? 2 : 1)}' | tr '\n' ' ' | sed 's/ $//')"
check "a haplotype carrying two merged alleles carries the merged one" \
  "1|1 1|0 0|0 0|0" "$(records 300 | head -1 | gts)"
check "a deletion leaving 120 bp behind stays apart" "2" "$(records 300 | wc -l)"
check "CONFLICT is the union of the merged members'" \
  "CONFLICT=a,b" "$(records 300 | head -1 | cut -f8 | tr ';' '\n' | grep CONFLICT)"
check "an inversion carrying 25 kb more stays apart" "2" "$(records 400 | wc -l)"
check "an insertion and a deletion of one size stay apart" "2" "$(records 500 | wc -l)"

python3 -I "$here/checkSiteAlleles.py" "$tmp/in.vcf" "$tmp/out.vcf" "$tmp/members.tsv" >/dev/null 2>&1
check "the checker passes the real collapse" "0" "$?"

# Each sabotage breaks one rule the checker owns; each must fail it.
python3 -I - "$here/collapseSiteAlleles.py" "$tmp" <<'EOF'
import sys
src, tmp = sys.argv[1], sys.argv[2]
s = open(src).read()
cases = {
    'merge_all': s.replace(
        "groups.setdefault((len(rec['fields'][3]), rec['kind']), []).append(rec)",
        "groups.setdefault((len(rec['fields'][3]), 'INS'), []).append(rec)",
    ).replace('lambda lo, hi: lo >= PCTSIZE * hi', 'lambda lo, hi: True'),
    'missing_to_ref': s.replace(
        "            out.append('.')\n    # every member",
        "            out.append('0')\n    # every member",
    ),
    'inv_by_ref': s.replace(
        "return len(alt) if kind == 'INV' else", "return len(ref) if kind == 'INV' else"
    ),
    'least_carried_rep': s.replace(
        "rep = max(cluster, key=lambda r: (r['carriers'], -r['order']))",
        "rep = min(cluster, key=lambda r: (r['carriers'], -r['order']))",
    ),
    'info_from_other': s.replace(
        "            f[7] = ';'.join(info)",
        "            f[7] = ';'.join(info)\n            f[7] = min(cluster, key=lambda r: r['carriers'])['fields'][7]",
    ),
    'unphased_cap_one': s.replace('n_alt = min(ploidy, sum(', 'n_alt = min(1, sum('),
    'drop_member_gts': s.replace(
        "per_sample = zip(*(r['fields'][9:] for r in cluster))",
        "per_sample = zip(*(r['fields'][9:] for r in cluster[:-1]))",
    ),
    'chained_clusters': s.replace(
        'if fits(measure(clusters[-1][0]), measure(rec)):',
        'if fits(measure(clusters[-1][-1]), measure(rec)):',
    ),
    'no_residual_rule': s.replace("        if kind == 'DEL'\n", '        if False\n'),
}
for name, text in cases.items():
    assert text != s, f'sabotage {name} no longer applies'
    open(f'{tmp}/sabotage_{name}.py', 'w').write(text)
EOF
for sabotage in "$tmp"/sabotage_*.py; do
  name=$(basename "$sabotage" .py)
  python3 -I "$sabotage" "$tmp/$name.tsv" <"$tmp/in.vcf" >"$tmp/$name.vcf"
  python3 -I "$here/checkSiteAlleles.py" "$tmp/in.vcf" "$tmp/$name.vcf" "$tmp/$name.tsv" >/dev/null 2>&1
  check "the checker fails ${name#sabotage_}" "1" "$?"
done

exit $fail
