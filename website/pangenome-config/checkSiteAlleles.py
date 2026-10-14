"""Check a collapsed callset against its input, record by record.

Usage: checkSiteAlleles.py <before.vcf> <after.vcf> [members.tsv]
(uncompressed). It shares no code with the collapse. Given the members file,
it audits each merge exactly: the members partition the POS's records, one
type, sizes within 5% and deletion leftovers within 50 bp, ALT and INFO from
the most-carried member, and every genotype per the merge rule. At every POS
it also checks, needing no members file:

- each input record's carriers sit inside one output record of the same REF
  length, SV type and a size within PCTSIZE of its own
- each output record's carriers come from input records it could have absorbed
  by that same rule, so a merge across types or sizes shows up as carriers
  with no source
- every sample keeps its number of called allele positions across the POS's
  records, so a missing call cannot turn into a reference one

A carrier is (sample, haplotype) for a phased call, and (sample, 'u', count)
for an unphased one, compared by count.
"""

import itertools
import sys

PCTSIZE = 0.95


def describe(f):
    ref, alt = f[3], f[4]
    if 'SVTYPE=INV' in f[7].split(';'):
        kind, size = 'INV', len(alt)
    else:
        kind, size = ('INS' if len(alt) > len(ref) else 'DEL'), abs(len(alt) - len(ref))
    phased, unphased, called = set(), {}, set()
    for i, gt in enumerate(f[9:]):
        a = gt.split(':')[0]
        calls = a.replace('/', '|').split('|')
        n_alt = sum(c not in ('0', '.') for c in calls)
        called.update((i, hp) for hp, c in enumerate(calls) if c != '.')
        if '/' in a and n_alt:
            unphased[i] = n_alt
        else:
            phased.update((i, hp) for hp, c in enumerate(calls) if c not in ('0', '.'))
    return {'key': (len(ref), kind), 'size': size, 'phased': phased, 'unphased': unphased, 'called': called}


def compatible(a, b):
    lo, hi = sorted((a['size'], b['size']))
    return a['key'] == b['key'] and lo >= PCTSIZE * hi


def contains(outer, inner):
    if not inner['phased'] <= outer['phased'] | {(i, hp) for i in outer['unphased'] for hp in range(8)}:
        return False
    return all(outer['unphased'].get(i, 0) >= n for i, n in inner['unphased'].items())


def positions(path):
    with open(path) as fh:
        rows = (line.rstrip('\n').split('\t') for line in fh if not line.startswith('#'))
        for pos, group in itertools.groupby(rows, key=lambda f: (f[0], f[1])):
            raw = list(group)
            yield pos, [describe(f) for f in raw], raw


def member_lines(path):
    with open(path) as fh:
        rows = (line.rstrip('\n').split('\t') for line in fh)
        for pos, group in itertools.groupby(rows, key=lambda f: (f[0], f[1])):
            yield pos, [[int(o) for o in f[3].split(',')] for f in group]


STALE = ('AC=', 'AF=', 'AN=', 'CONFLICT=', 'NumCollapsed=')


def info_core(info):
    return sorted(kv for kv in info.split(';') if kv != '.' and not kv.startswith(STALE))


def alt_count(gt):
    return sum(c not in ('0', '.') for c in gt.replace('/', '|').split('|'))


def expected_gt(gts):
    """The merge rule, stated per sample from the members' GTs."""
    split = [g.replace('/', '|').split('|') for g in gts]
    ploidy = max(len(s) for s in split)
    if any('/' in g and alt_count(g) for g in gts):
        n_alt = min(ploidy, sum(alt_count(g) for g in gts))
        called = max(sum(c != '.' for c in s) for s in split)
        return ('u', n_alt, max(called, n_alt))
    hps = []
    for hp in range(ploidy):
        calls = [s[hp] for s in split if hp < len(s)]
        hps.append('1' if any(c not in ('0', '.') for c in calls) else '0' if '0' in calls else '.')
    return ('/' if all('/' in g for g in gts) else '|', tuple(hps))


def observed_gt(gt, unphased_expected):
    calls = gt.replace('/', '|').split('|')
    if unphased_expected:
        return ('u', alt_count(gt), sum(c != '.' for c in calls))
    return ('/' if '/' in gt else '|', tuple('1' if c not in ('0', '.') else c for c in calls))


def audit(pos, raw_before, raw_after, groups):
    problems = []
    flat = sorted(o for g in groups for o in g)
    if flat != list(range(len(raw_before))) or len(groups) != len(raw_after):
        return [f'{pos}: members are not a partition of the input records']
    for out, group in zip(raw_after, groups):
        recs = [raw_before[o] for o in group]
        descs = [describe(r) for r in recs]
        if len({d['key'] for d in descs}) != 1:
            problems.append(f'{pos}: a merge crosses REF length or SV type')
        sizes = [d['size'] for d in descs]
        if min(sizes) < PCTSIZE * max(sizes):
            problems.append(f'{pos}: a merge spans more than 5% in size')
        if descs[0]['key'][1] == 'DEL' and max(len(r[4]) for r in recs) - min(len(r[4]) for r in recs) >= 50:
            problems.append(f'{pos}: a merge joins deletions leaving different sequence')
        counts = [sum(alt_count(g.split(':')[0]) for g in r[9:]) for r in recs]
        rep = recs[max(range(len(recs)), key=lambda i: (counts[i], -group[i]))]
        if out[4] != rep[4] or info_core(out[7]) != info_core(rep[7]):
            problems.append(f'{pos}: ALT or INFO is not the most-carried member\'s')
        for i, cell in enumerate(out[9:]):
            gts = [r[9 + i].split(':')[0] for r in recs]
            want = expected_gt(gts)
            if observed_gt(cell.split(':')[0], want[0] == 'u') != want:
                problems.append(f'{pos}: a genotype breaks the merge rule')
                break
    return problems


def main():
    sites = n_before = n_after = 0
    problems = []
    members = member_lines(sys.argv[3]) if len(sys.argv) > 3 else None
    for (pb, before, raw_before), (pa, after, raw_after) in zip(
        positions(sys.argv[1]), positions(sys.argv[2]), strict=True
    ):
        if pb != pa:
            sys.exit(f'position order diverged: {pb} vs {pa}')
        if members:
            pm, groups = next(members)
            if pm != pb:
                sys.exit(f'members file diverged: {pm} vs {pb}')
            problems.extend(audit(pb, raw_before, raw_after, groups))
        sites += 1
        n_before += len(before)
        n_after += len(after)
        for rec in before:
            if (rec['phased'] or rec['unphased']) and not any(
                compatible(rec, out) and contains(out, rec) for out in after
            ):
                problems.append(f'{pb}: an input record\'s carriers have no compatible home')
        for out in after:
            sources = [rec for rec in before if compatible(rec, out)]
            phased_src = set().union(*(r['phased'] for r in sources)) if sources else set()
            unphased_src = {}
            for r in sources:
                for i, n in r['unphased'].items():
                    unphased_src[i] = unphased_src.get(i, 0) + n
                for i, hp in r['phased']:
                    if any(i in s['unphased'] for s in sources):
                        unphased_src[i] = unphased_src.get(i, 0) + 1
            if not out['phased'] <= phased_src or any(
                n > unphased_src.get(i, 0) for i, n in out['unphased'].items()
            ):
                problems.append(f'{pb}: an output record holds carriers no compatible input had')
        # counted per sample: an unphased call's positions carry no order
        def called_per_sample(recs):
            counts = {}
            for i, hp in set().union(*(r['called'] for r in recs)):
                counts[i] = counts.get(i, 0) + 1
            return counts

        if called_per_sample(before) != called_per_sample(after):
            problems.append(f'{pb}: called/missing status changed')
    for p in problems[:5]:
        print(p, file=sys.stderr)
    print(f'{sites} positions, {n_before} -> {n_after} records, {len(problems)} problems')
    sys.exit(1 if problems else 0)


main()
