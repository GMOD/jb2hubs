"""Which side the assemblies take in each kgAdjudicate.py pair: a haplotype
whose span is shorter by the deletion's length (within 20%) carries it, one
within 20% of no change lacks it, and anything else leaves the pair unscored.

Usage: kgVerdicts.py <kgAdjudicate.py's out.tsv>
"""
import csv
import sys
from collections import Counter

rows = [r for r in csv.DictReader(open(sys.argv[1]), delimiter='\t')]
by = {}
for r in rows:
    by.setdefault(r['window'], {})[r['member'].split('#')[1]] = r
t = Counter()
examples = []
for name, haps in by.items():
    kind, span, L, s, d, gd = name.split('|')
    L, d, gd = int(L), int(d), int(gd)
    calls = []
    for n in ('1', '2'):
        r = haps.get(n)
        if not r or r['status'] != 'ok':
            calls.append(None)
            continue
        net = int(r['net'])
        calls.append(1 if abs(net + L) <= 0.2 * L else 0 if abs(net) <= 0.2 * L else None)
    if None in calls:
        why = 'no bam' if any(h.get('status') == 'fetch failed' for h in haps.values()) else 'unscored'
        t[(kind, why)] += 1
        continue
    truth = sum(calls)
    verdict = ('both' if truth == d == gd else 'graph' if truth == gd else '1kgp' if truth == d else 'neither')
    t[(kind, verdict)] += 1
    if kind == 'disagree':
        t[(kind, f'1kgp {d} graph {gd} -> {verdict}')] += 1
    if verdict in ('1kgp', 'neither') and len(examples) < 15:
        examples.append(f'{name} nets={[haps[n]["net"] for n in ("1", "2")]} offsets={[haps[n]["offset"] for n in ("1", "2")]}')
for k, v in sorted(t.items()):
    print(*k, v, sep='\t')
print('\n'.join(examples))
