"""Sample (deletion, sample) pairs where 1KGP and the sidecar disagree, plus
as many where they agree on a carrier, as windows for kgAdjudicate.py.

Usage: kgDisputes.py <sidecar.tsv.gz> <deletions.tsv> <samples> <out.jsonl> <n>
The inputs are kgConcordance.py's. Read-depth-only calls are left out.
"""
import json
import os
import random
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import kgConcordance as k

sidecar, deletions, samples, out, n = sys.argv[1], sys.argv[2], sys.argv[3], sys.argv[4], int(sys.argv[5])
haps, rows = k.read_sidecar(sidecar)
starts = {c: [r[0] for r in v] for c, v in rows.items()}
index = {}
for i, h in enumerate(haps):
    s, m = h.split('#')
    index.setdefault(s, {})[m] = i
samples = open(samples).read().split()
pairs = {'disagree': [], 'agree': []}
for line in open(deletions):
    chrom, pos, end, svlen, _, alg, gts = line.rstrip('\n').split('\t')
    if alg == 'depth':
        continue
    a, b, L = int(pos), int(end), -int(svlen)
    kg = [k.dosage(g) for g in gts.rstrip(',').split(',')]
    if not any(kg):
        continue
    m = k.best_row(rows.get(chrom, []), starts.get(chrom, []), a, b, L)
    if not m:
        continue
    _, g, states = m
    for s, d in zip(samples, kg):
        pr = [g[index[s]['1']], g[index[s]['2']]]
        if d is None or any(x in '._~' for x in pr):
            continue
        gd = sum(x in states for x in pr)
        if d != gd:
            pairs['disagree'].append((chrom, a, b, L, s, d, gd))
        elif d:
            pairs['agree'].append((chrom, a, b, L, s, d, gd))
random.seed(1)
with open(out, 'w') as o:
    for kind, ps in pairs.items():
        print(kind, len(ps), file=sys.stderr)
        for chrom, a, b, L, s, d, gd in random.sample(ps, min(n, len(ps))):
            o.write(json.dumps({'name': f'{kind}|{chrom}:{a}-{b}|{L}|{s}|{d}|{gd}',
                                'chrom': chrom, 'ws': a, 'we': b, 'sample': s}) + '\n')
