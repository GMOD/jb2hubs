"""Score each form member's claimed net change against an assembly's.

Usage: scoreForms.py <forms.jsonl> <sidecar.tsv.gz> <truth.tsv> [--misses N]
                     [--complete-claims]
truth.tsv: flankTruth.py's or bamTruth.py's output.

A member's claim is its form's deltas plus the change every haplotype shares
at the window's single-state records, which mark nothing, plus its own sizes
at the rows beyond the window that the truth's span takes in. Over a widened
span the claim is the member's own sum over every record in it. A claim agrees
within 10% or 500 bp.

--complete-claims scores printWalkForms.ts' output, whose forms already mark
the changes every haplotype shares, and reads no sidecar. The member's walks
in the window's `spans` give the terms the sidecar gave: its net from changes
beyond the window, and over a widened span its whole net.

Scored apart, since their claims are knowingly loose:

- members of a form with an unsized site (uncalled, inverted, bypassed, or a
  rare state under a no-call majority), which claims no size there
- rare carriers, whose state the form folds into its site's majority
"""

import csv
import gzip
import json
import statistics
import sys
from collections import Counter, defaultdict

TOL_BP = 500
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
    """The narrowest span anchored for each (window, member)."""
    best = {}
    for r in csv.DictReader(open(path), delimiter='\t'):
        key = (r['window'], r['member'])
        prev = best.get(key)
        if prev is None or (r['status'] == 'ok' and (
                prev['status'] != 'ok' or int(r['offset']) < int(prev['offset']))):
            best[key] = r
    return best


def main():
    forms, sidecar, truth_path = sys.argv[1:4]
    misses_shown = int(sys.argv[sys.argv.index('--misses') + 1]) if '--misses' in sys.argv else 15
    complete = '--complete-claims' in sys.argv
    names, rows = ([], defaultdict(list)) if complete else read_sidecar(sidecar)
    truth = read_truth(truth_path)
    tally = defaultdict(Counter)
    gaps = defaultdict(list)
    misses = []
    for line in open(forms):
        w = json.loads(line)
        if not w['rowSpan']:
            continue
        kind = 'random' if w['name'].startswith('rand') else 'locus'
        records = [r for r in rows[w['chrom']] if r[0] < w['end'] and r[1] >= w['start']]
        shared = sum(size(r[3][0], r[2]) or 0 for r in records if len(set(r[3])) == 1)
        rare = set(w['rareCarriers'])
        for f in w['forms']:
            for m in f['members']:
                t = truth.get((w['name'], m))
                if not t or t['status'] != 'ok':
                    tally[kind]['no truth: ' + (t['status'].split(' ')[0] if t else 'missing')] += 1
                    continue
                ws, we = int(t['ws']), int(t['we'])
                walk = w['spans'].get(f'{ws}-{we}', {}).get(m, {}) if complete else {}
                i = None if complete else names.index(m)
                if complete and t['offset'] == '0':
                    if walk.get('beyond') is None:
                        tally[kind]['no truth: walks miss the span'] += 1
                        continue
                    claim = sum(f['deltas']) + walk['beyond']
                elif t['offset'] == '0':
                    # The truth spans every row the window's rows reach, so the
                    # rows beyond the window count too: a 415 kb parent at
                    # chr19:21.88 Mb carries a 9.5 kb insertion 220 kb outside
                    # its window.
                    beyond = [size(r[3][i], r[2]) if r[3][i] != '_' else 0
                              for r in rows[w['chrom']]
                              if r[0] >= ws and r[1] <= we and not (r[0] < w['end'] and r[1] >= w['start'])]
                    if None in beyond:
                        tally[kind]['no truth: widened over an unsized site'] += 1
                        continue
                    claim = sum(f['deltas']) + shared + sum(beyond)
                else:
                    sizes = [walk.get('net')] if complete else [
                        size(r[3][i], r[2]) for r in rows[w['chrom']] if r[0] >= ws and r[1] <= we]
                    if None in sizes or f['unsized']:
                        tally[kind]['no truth: widened over an unsized site'] += 1
                        continue
                    claim = sum(sizes)
                actual = int(t['net'])
                agrees = abs(claim - actual) <= max(TOL_BP, TOL_FRACTION * max(abs(claim), abs(actual)))
                group = kind + (' unsized' if f['unsized'] else ' rare' if m in rare else '')
                if group == kind:
                    big = max(abs(claim), abs(actual))
                    band = '>=1 kb, within 10%' if big >= 1000 else '50 bp-1 kb, within 50 bp' if big >= 50 else None
                    if band:
                        tally[kind, band]['scored'] += 1
                        tally[kind, band]['agree'] += abs(claim - actual) <= (0.1 * big if big >= 1000 else 50)
                for key in (group, w['name']) if group == kind else (group,):
                    tally[key]['scored'] += 1
                    tally[key]['agree'] += agrees
                if group == kind:
                    gaps[kind].append(abs(claim - actual))
                    if not agrees:
                        misses.append((abs(claim - actual), w['name'], m, claim, actual, len(f['members']), t['offset']))
    print(f'claims within {TOL_FRACTION:.0%} or {TOL_BP} bp of the assembly:')
    for key in ('locus', 'random', 'locus unsized', 'random unsized', 'locus rare', 'random rare'):
        c = tally[key]
        if c['scored']:
            print(f"  {key:15s} {c['agree']:6d}/{c['scored']:<6d} {c['agree'] / c['scored']:.3f}")
    print('by the larger of claim and assembly change:')
    for kind in ('locus', 'random'):
        for band in ('>=1 kb, within 10%', '50 bp-1 kb, within 50 bp'):
            c = tally[kind, band]
            if c['scored']:
                print(f"  {kind:6s} {band:25s} {c['agree']:6d}/{c['scored']:<6d} {c['agree'] / c['scored']:.3f}")
    for kind in ('locus', 'random'):
        if gaps[kind]:
            g = sorted(gaps[kind])
            print(f'  {kind} |claim - assembly| median {statistics.median(g):.0f} bp, 90th percentile {g[len(g) * 9 // 10]} bp')
        unscored = {k: v for k, v in tally[kind].items() if k.startswith('no truth')}
        if unscored:
            print(f'  {kind} unscored: {unscored}')
    print('per window:')
    for key, c in tally.items():
        if isinstance(key, str) and c['scored'] and ' ' not in key and key not in ('locus', 'random'):
            print(f"  {key:10s} {c['agree']}/{c['scored']}")
    print('largest misses (gap, window, member, claim, assembly, form size, offset):')
    for miss in sorted(misses, reverse=True)[:misses_shown]:
        print('  ', miss)


if __name__ == '__main__':
    main()
