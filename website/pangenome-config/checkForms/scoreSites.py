"""Score each form member's claim at each site cluster against its assembly.

Usage: scoreSites.py <sites.jsonl> <sidecar.tsv.gz> <truth.tsv>
truth.tsv: bamTruth.py's or flankTruth.py's output for printSites.py's lines.

Two claims per member, both within 10% or 50 bp:

- the form's, from the marks the page draws at the cluster, plus the change
  every haplotype shares at its single-state records: what a reader is told
- the member's own, its sidecar states summed over the cluster: what the
  callset says of that haplotype, with no folding into forms

A cluster a record straddles is skipped, since neither sum covers it. Scored
apart: members of a form with an unsized mark there, rare carriers, and
carriers of a size at a restored parent that holds the whole cluster, since
the parent's change may lie anywhere in it.
"""

import csv
import gzip
import json
import sys
from collections import Counter, defaultdict

TOL_BP = 50
TOL_FRACTION = 0.1


def read_sidecar(path):
    rows = defaultdict(list)
    with gzip.open(path, 'rt') as f:
        names = f.readline().rstrip('\n').split('\t')[1].split(',')
        for line in f:
            c = line.rstrip('\n').split('\t')
            sizes = dict(kv.split(':', 1) for kv in c[4].split(',')) if c[4] != '.' else {}
            rows[c[0]].append((int(c[1]), int(c[2]), sizes, c[5]))
    return names, rows


def size(state, sizes):
    if state == '0':
        return 0
    value = sizes.get(state, state)
    return int(value) if value.lstrip('+-').isdigit() else None


def read_truth(path):
    best = {}
    for r in csv.DictReader(open(path), delimiter='\t'):
        key = (r['window'], r['member'])
        prev = best.get(key)
        if prev is None or (r['status'] == 'ok' and (
                prev['status'] != 'ok' or int(r['offset']) < int(prev['offset']))):
            best[key] = r
    return best


def agrees(claim, actual):
    return abs(claim - actual) <= max(TOL_BP, TOL_FRACTION * max(abs(claim), abs(actual)))


def band(claim, actual):
    big = max(abs(claim), abs(actual))
    return '<50' if big < 50 else '50-1k' if big < 1000 else '>=1k'


def main():
    sites, sidecar, truth_path = sys.argv[1:4]
    names, rows = read_sidecar(sidecar)
    truth = read_truth(truth_path)
    t = defaultdict(Counter)
    straddled = 0
    for line in open(sites):
        c = json.loads(line)
        kind = 'random' if c['window'].startswith('rand') else 'example'
        recs = [r for r in rows[c['chrom']] if r[0] < c['end'] and r[1] > c['start']]
        holding = [r for r in recs if r[0] <= c['start'] and r[1] >= c['end']]
        inside = [r for r in recs if r[0] >= c['start'] and r[1] <= c['end']]
        if len(holding) + len(inside) < len(recs):
            straddled += 1
            continue
        shared = sum(size(r[3][0], r[2]) or 0 for r in inside if len(set(r[3])) == 1)
        rare = set(c['rareCarriers'])
        for f in c['forms']:
            for m in f['members']:
                tr = truth.get((c['name'], m))
                if not tr or tr['status'] != 'ok':
                    t[kind]['unscored'] += 1
                    continue
                actual = int(tr['net'])
                i = names.index(m)
                ws, we = int(tr['ws']), int(tr['we'])
                own = [size(r[3][i], r[2]) for r in rows[c['chrom']] if r[0] >= ws and r[1] <= we]
                nested = any(size(r[3][i], r[2]) not in (0, None) for r in holding)
                if tr['offset'] != '0' or f['unsized'] or m in rare or nested or None in own:
                    group = ('widened' if tr['offset'] != '0' else 'nested' if nested else
                             'unsized' if f['unsized'] or None in own else 'rare')
                    t[kind, group]['n'] += 1
                    if None not in own:
                        t[kind, group]['own'] += agrees(sum(own), actual)
                    continue
                form = f['claim'] + shared
                b = band(form, actual)
                for key in ((kind, b), (kind, 'all')):
                    t[key]['n'] += 1
                    t[key]['form'] += agrees(form, actual)
                    t[key]['own'] += agrees(sum(own), actual)
                if b != '<50' and not agrees(form, actual):
                    t[kind, b, 'miss'][('form says none' if abs(form) < 50 else
                                        'assembly none' if abs(actual) < 50 else
                                        'other way' if form * actual < 0 else 'size')] += 1
    print(f'claims within {TOL_FRACTION:.0%} or {TOL_BP} bp; {straddled} clusters straddled by a record, skipped')
    for kind in ('example', 'random'):
        print(kind, f"(unscored {t[kind]['unscored']})")
        for b in ('>=1k', '50-1k', '<50', 'all'):
            c = t[kind, b]
            if c['n']:
                print(f"  {b:6s} n={c['n']:7d}  form {c['form'] / c['n']:.3f}  own {c['own'] / c['n']:.3f}")
                miss = t[kind, b, 'miss']
                if miss:
                    print(f'         form misses: {dict(miss)}')
        for g in ('nested', 'unsized', 'rare', 'widened'):
            c = t[kind, g]
            if c['n']:
                print(f"  {g:8s} n={c['n']:6d}  own {c['own'] / c['n']:.3f}")


if __name__ == '__main__':
    main()
