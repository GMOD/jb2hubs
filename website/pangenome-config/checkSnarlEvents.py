"""Check mergeSnarlEvents.py's output against its input, merge by merge.

Usage: checkSnarlEvents.py <before.vcf> <after.vcf> <members.tsv>
(uncompressed). It shares no code with the merge. It checks that:

- the members partition the input records, one line per output record, in
  the output's order, and the output is sorted by POS
- a record left alone is the input line unchanged
- a merge's members name one snarl, one SV type, sizes within 5%, deletion
  ALTs within 50 bp, each starting within the event's size (1 kb at least) of
  the members before it, and no carrier haplotype twice or unphased
- a merge takes the most-carried member's fields, NumCollapsed summed over the
  members, and every genotype per the merge rule
- the callset keeps its count of carrier haplotypes
"""

import sys

PCTSIZE = 0.95
RESIDUAL_BP = 50
MIN_REACH = 1000
STALE = ('AC=', 'AF=', 'AN=', 'CONFLICT=', 'NumCollapsed=')


def rows(path):
    with open(path) as fh:
        return [line.rstrip('\n').split('\t') for line in fh if not line.startswith('#')]


def snarl(f):
    first = f[2].split(';')[0]
    head, sep, tail = first.rpartition('_')
    return head if sep and head and tail.isdigit() else first


def kind_size(f):
    if 'SVTYPE=INV' in f[7].split(';'):
        return 'INV', len(f[4])
    d = len(f[4]) - len(f[3])
    return ('INS' if d > 0 else 'DEL'), abs(d)


def calls(cell):
    a = cell.split(':')[0]
    return a, a.replace('/', '|').split('|')


def carriers(f):
    phased, unphased = set(), 0
    for i, cell in enumerate(f[9:]):
        a, cs = calls(cell)
        for hp, c in enumerate(cs):
            if c not in ('0', '.'):
                if '/' in a:
                    unphased += 1
                else:
                    phased.add((i, hp))
    return phased, unphased


def expected_gt(cells):
    split = [calls(c) for c in cells]
    hps = []
    for hp in range(max(len(cs) for _, cs in split)):
        here = [cs[hp] for _, cs in split if hp < len(cs)]
        hps.append('1' if any(c not in ('0', '.') for c in here) else '0' if '0' in here else '.')
    return ('/' if all('/' in a for a, _ in split) else '|').join(hps)


def info_core(info):
    return sorted(kv for kv in info.split(';') if kv != '.' and not kv.startswith(STALE))


def num_collapsed(info):
    for kv in info.split(';'):
        if kv.startswith('NumCollapsed='):
            return int(kv[len('NumCollapsed=') :])
    return 1


def audit(group, before, out):
    if len(group) == 1:
        return [] if before[group[0]] == out else ['a record left alone changed']
    recs = [before[o] for o in group]
    problems = []
    if any(snarl(r) == '.' for r in recs) or len({snarl(r) for r in recs}) != 1:
        problems.append('a merge crosses snarls')
    kinds = {kind_size(r)[0] for r in recs}
    sizes = [kind_size(r)[1] for r in recs]
    if len(kinds) != 1:
        problems.append('a merge crosses SV types')
    if min(sizes) < PCTSIZE * max(sizes):
        problems.append('a merge spans more than 5% in size')
    if kinds == {'DEL'} and max(len(r[4]) for r in recs) - min(len(r[4]) for r in recs) >= RESIDUAL_BP:
        problems.append('a merge joins deletions leaving different sequence')
    reach = max(max(sizes), MIN_REACH)
    by_pos = sorted(recs, key=lambda r: int(r[1]))
    end = int(by_pos[0][1]) + len(by_pos[0][3]) - 1
    for r in by_pos[1:]:
        if int(r[1]) - end > reach:
            problems.append('a merge reaches past the event size')
        end = max(end, int(r[1]) + len(r[3]) - 1)
    seen = set()
    for r in recs:
        phased, unphased = carriers(r)
        if unphased:
            problems.append('a merge holds an unphased carrier')
        if seen & phased:
            problems.append('a merge holds one haplotype twice')
        seen |= phased
    counts = [len(carriers(r)[0]) for r in recs]
    rep = recs[max(range(len(recs)), key=lambda i: (counts[i], -group[i]))]
    if out[:7] != rep[:7] or info_core(out[7]) != info_core(rep[7]):
        problems.append("the fields are not the most-carried member's")
    if num_collapsed(out[7]) != sum(num_collapsed(r[7]) for r in recs):
        problems.append('NumCollapsed is not the members\' sum')
    for i, cell in enumerate(out[9:]):
        if cell.split(':')[0] != expected_gt([r[9 + i] for r in recs]):
            problems.append('a genotype breaks the merge rule')
            break
    return problems


def main():
    before, after = rows(sys.argv[1]), rows(sys.argv[2])
    with open(sys.argv[3]) as fh:
        groups = [[int(o) for o in line.rstrip('\n').split('\t')[2].split(',')] for line in fh]
    problems = []
    if sorted(o for g in groups for o in g) != list(range(len(before))) or len(groups) != len(after):
        sys.exit('members are not a partition of the input records')
    if [int(f[1]) for f in after] != sorted(int(f[1]) for f in after):
        problems.append('output is not sorted by POS')
    merges = 0
    for group, out in zip(groups, after):
        merges += len(group) > 1
        problems.extend(f'{out[0]}:{out[1]}: {p}' for p in audit(group, before, out))
    total = lambda recs: sum(len(carriers(r)[0]) + carriers(r)[1] for r in recs)
    if total(before) != total(after):
        problems.append(f'carrier haplotypes {total(before)} -> {total(after)}')
    for p in problems[:5]:
        print(p, file=sys.stderr)
    print(f'{len(before)} -> {len(after)} records, {merges} merges, {len(problems)} problems')
    sys.exit(1 if problems else 0)


main()
