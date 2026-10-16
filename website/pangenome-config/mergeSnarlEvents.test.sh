#!/bin/bash
#
# mergeSnarlEvents.test.sh
#
# Tests for mergeSnarlEvents.py on synthetic snarls, and for
# checkSnarlEvents.py: it must pass the real merge and fail each sabotaged
# copy, or a green build proves nothing.
# Run: ./mergeSnarlEvents.test.sh
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
def rec(pos, rid, ref_len, alt_len, gts, info='.'):
    return '\t'.join(['chr1', str(pos), rid, 'N' * ref_len, 'N' * alt_len, '.', '.', info, 'GT', *gts])

print('\n'.join([
    '##fileformat=VCFv4.2',
    '##contig=<ID=chr1>',
    '##INFO=<ID=NumCollapsed,Number=1,Type=Integer,Description="Same-site alleles">',
    '#CHROM\tPOS\tID\tREF\tALT\tQUAL\tFILTER\tINFO\tFORMAT\ta\tb\tc\td',
    # one 2 kb insertion anchored three ways; the most-carried member at 400
    rec(100, '>1>9;>2>3', 1, 2001, ['1|0', '0|0', '0|0', '0|0'], 'NumCollapsed=2'),
    rec(400, '>1>9;>4>5', 1, 2003, ['0|1', '1|0', '0|0', '.|0']),
    rec(900, '>1>9', 1, 1990, ['0|0', '0|0', '0|0', '1|0'], 'CONFLICT=d'),
    # the same snarl and size, past the event's reach
    rec(4000, '>1>9', 1, 2001, ['0|0', '0|0', '1|0', '0|0']),
    # a 1.5 kb deletion vcfwave anchored twice in one snarl
    rec(5000, '>7>8_80', 1501, 1, ['1|0', '0|0', '0|0', '.|0']),
    rec(5004, '>7>8_82', 1501, 1, ['0|0', '0|1', '0|0', '.|0']),
    # one haplotype carrying both: two copies stay two
    rec(7000, '>10>11', 1, 301, ['1|0', '0|0', '0|0', '0|0']),
    rec(7100, '>10>11', 1, 301, ['1|0', '0|1', '0|0', '0|0']),
    # one size, two snarls
    rec(9000, '>20>21', 1, 501, ['1|0', '0|0', '0|0', '0|0']),
    rec(9010, '>22>23', 1, 501, ['0|0', '1|0', '0|0', '0|0']),
    # an unphased carrier stays apart
    rec(11000, '>30>31', 1, 601, ['0/1', '0/0', '0/0', '0/0']),
    rec(11005, '>30>31', 1, 601, ['0|0', '1|0', '0|0', '0|0']),
    # a deletion leaving 120 bp behind stays apart
    rec(13000, '>40>41', 3001, 1, ['1|0', '0|0', '0|0', '0|0']),
    rec(13002, '>40>41', 3001, 121, ['0|0', '1|0', '0|0', '0|0']),
    # no ID: nothing to merge by
    rec(15000, '.', 1, 401, ['1|0', '0|0', '0|0', '0|0']),
    rec(15001, '.', 1, 401, ['0|0', '1|0', '0|0', '0|0']),
    # one snarl, sizes 20% apart
    rec(17000, '>50>51', 1, 1001, ['1|0', '0|0', '0|0', '0|0']),
    rec(17010, '>50>51', 1, 1201, ['0|0', '1|0', '0|0', '0|0']),
]))
EOF

python3 -I "$here/mergeSnarlEvents.py" "$tmp/members.tsv" <"$tmp/in.vcf" >"$tmp/out.vcf"
records() { grep -v '^#' "$tmp/out.vcf" | awk -F'\t' -v lo="$1" -v hi="$2" '$2 >= lo && $2 <= hi'; }
gts() { cut -f10- | tr '\t' ' '; }

check "three anchors of one insertion merge at the most-carried one" "400" "$(records 100 3999 | cut -f2)"
check "the merge carries every member's haplotypes" "1|1 1|0 0|0 1|0" "$(records 100 3999 | gts)"
check "NumCollapsed sums the members'" "NumCollapsed=4" "$(records 100 3999 | cut -f8 | tr ';' '\n' | grep NumCollapsed)"
check "CONFLICT carries over" "CONFLICT=d" "$(records 100 3999 | cut -f8 | tr ';' '\n' | grep CONFLICT)"
check "the same event past its reach stays apart" "4000" "$(records 4000 4999 | cut -f2)"
check "a deletion's two vcfwave anchors merge" "1" "$(records 5000 5999 | wc -l)"
check "a haplotype missing on every member stays missing" "1|0 0|1 0|0 .|0" "$(records 5000 5999 | gts)"
check "a haplotype with two copies keeps two records" "2" "$(records 7000 7999 | wc -l)"
check "two snarls stay apart" "2" "$(records 9000 9999 | wc -l)"
check "an unphased carrier stays apart" "2" "$(records 11000 11999 | wc -l)"
check "a deletion leaving 120 bp behind stays apart" "2" "$(records 13000 13999 | wc -l)"
check "records with no ID stay apart" "2" "$(records 15000 15999 | wc -l)"
check "sizes 20% apart stay apart" "2" "$(records 17000 17999 | wc -l)"
check "the NumCollapsed header names both merges" "1" \
  "$(grep -c "across one snarl's anchors" "$tmp/out.vcf")"

python3 -I "$here/checkSnarlEvents.py" "$tmp/in.vcf" "$tmp/out.vcf" "$tmp/members.tsv" >/dev/null 2>&1
check "the checker passes the real merge" "0" "$?"

# Each sabotage breaks one rule the checker owns; each must fail it.
python3 -I - "$here/mergeSnarlEvents.py" "$tmp" <<'EOF'
import sys
src, tmp = sys.argv[1], sys.argv[2]
s = open(src).read()
cases = {
    'any_snarl': s.replace("'snarl': snarl_of(f[2]),", "'snarl': 'one',"),
    'shared_carrier': s.replace(
        "return not any(rec['carriers'] & r['carriers'] for r in cluster)", 'return True'
    ),
    'unbounded_reach': s.replace('> max(max(sizes), MIN_REACH)', '> 10**9'),
    'any_size': s.replace('if min(sizes) < PCTSIZE * max(sizes):', 'if False:'),
    'no_residual_rule': s.replace('if max(alts) - min(alts) >= RESIDUAL_BP:', 'if False:'),
    'unphased_merge': s.replace(
        "if rec['carriers'] is None or any(r['carriers'] is None for r in cluster):\n        return False",
        "if rec['carriers'] is None or any(r['carriers'] is None for r in cluster):\n        rec['carriers'] = rec['carriers'] or set()",
    ),
    'missing_to_ref': s.replace("            out.append('.')\n", "            out.append('0')\n"),
    'least_carried_rep': s.replace(
        "return max(cluster, key=lambda r: (len(r['carriers'] or ()), -r['order']))",
        "return min(cluster, key=lambda r: (len(r['carriers'] or ()), -r['order']))",
    ),
    'first_pos_sort': s.replace(
        "clusters.sort(key=lambda c: (representative(c)['pos'], c[0]['order']))",
        "clusters.sort(key=lambda c: (-c[0]['pos'], c[0]['order']))",
    ),
    'num_collapsed_count': s.replace(
        "sum(num_collapsed(r[\"fields\"][7]) for r in cluster)", 'len(cluster)'
    ),
    'drop_member_gts': s.replace(
        "zip(*(r['fields'][9:] for r in cluster))", "zip(*(r['fields'][9:] for r in cluster[:-1]))"
    ),
}
for name, text in cases.items():
    assert text != s, f'sabotage {name} no longer applies'
    open(f'{tmp}/sabotage_{name}.py', 'w').write(text)
EOF
for sabotage in "$tmp"/sabotage_*.py; do
  name=$(basename "$sabotage" .py)
  python3 -I "$sabotage" "$tmp/$name.tsv" <"$tmp/in.vcf" >"$tmp/$name.vcf" 2>/dev/null
  python3 -I "$here/checkSnarlEvents.py" "$tmp/in.vcf" "$tmp/$name.vcf" "$tmp/$name.tsv" >/dev/null 2>&1
  status=$?
  check "the checker fails ${name#sabotage_}" "1" "$([[ $status -ne 0 ]] && echo 1 || echo 0)"
done

exit $fail
