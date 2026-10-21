"""Genotypes of the sidecar's deletions against 1000 Genomes' short-read SV
calls (Byrska-Bishop et al. 2022) for the 222 HPRC samples both sets hold.

Usage: kgConcordance.py <sidecar.tsv.gz> <deletions.tsv> <samples>
deletions.tsv: PASS deletions of 1 kb or more from the 1KGP callset, one per
line as bcftools query writes `%CHROM %POS %INFO/END %INFO/SVLEN %INFO/AF
%INFO/ALGORITHMS [%GT,]` over <samples>, in that order.

A 1KGP deletion matches the sidecar row that overlaps it reciprocally by half
or more and has a deletion state within 20% of its length. A haplotype carries
it if its state there is such a deletion. A sample with a no call on either
haplotype, or a missing 1KGP genotype, is skipped. Read-depth-only calls,
whose breakpoints are bins, are counted apart.
"""

import bisect
import gzip
import sys
from collections import Counter, defaultdict

MIN_OVERLAP = 0.5
SIZE_TOLERANCE = 0.2


def read_sidecar(path):
    rows = defaultdict(list)
    with gzip.open(path, 'rt') as f:
        haps = f.readline().rstrip('\n').split('\t')[1].split(',')
        for line in f:
            c = line.rstrip('\n').split('\t')
            dels = {}
            if c[4] != '.':
                for kv in c[4].split(','):
                    k, v = kv.split(':', 1)
                    if v.lstrip('+-').isdigit() and int(v) <= -1000:
                        dels[k] = -int(v)
            if dels:
                rows[c[0]].append((int(c[1]), int(c[2]), dels, c[5]))
    for v in rows.values():
        v.sort()
    return haps, rows


def overlap(a1, b1, a2, b2):
    ov = min(b1, b2) - max(a1, a2)
    return ov / max(b1 - a1, b2 - a2) if ov > 0 else 0


def dosage(gt):
    return None if '.' in gt else sum(a != '0' for a in gt.replace('|', '/').split('/'))


def best_row(rows, starts, a, b, length):
    best = None
    for r in rows[bisect.bisect_left(starts, a - 2_000_000):]:
        if r[0] > b:
            break
        o = overlap(a, b, r[0], r[1])
        states = {k for k, v in r[2].items() if abs(v - length) <= SIZE_TOLERANCE * length}
        if o >= MIN_OVERLAP and states and (best is None or o > best[0]):
            best = (o, r[3], states)
    return best


def main():
    sidecar, deletions, samples = sys.argv[1:4]
    haps, rows = read_sidecar(sidecar)
    starts = {k: [r[0] for r in v] for k, v in rows.items()}
    index = defaultdict(dict)
    for i, h in enumerate(haps):
        s, n = h.split('#')
        index[s][n] = i
    samples = open(samples).read().split()
    bands = defaultdict(Counter)
    confusion = Counter()
    for line in open(deletions):
        chrom, pos, end, svlen, _, algorithms, gts = line.rstrip('\n').split('\t')
        a, b, length = int(pos), int(end), -int(svlen)
        kg = [dosage(g) for g in gts.rstrip(',').split(',')]
        if not any(kg):
            continue
        band = ('1-10 kb' if length < 10_000 else '10-100 kb' if length < 100_000 else '>=100 kb') + (
            ', depth only' if algorithms == 'depth' else '')
        match = best_row(rows.get(chrom, []), starts.get(chrom, []), a, b, length)
        if match is None:
            bands[band]['unmatched'] += 1
            continue
        bands[band]['matched'] += 1
        _, genotypes, states = match
        for s, d in zip(samples, kg):
            pair = [genotypes[index[s]['1']], genotypes[index[s]['2']]]
            if d is None or any(x in '._~' for x in pair):
                continue
            g = sum(x in states for x in pair)
            confusion[(d, g)] += 1
            bands[band]['genotypes'] += 1
            bands[band]['agree'] += d == g
    print('band\tmatched\tunmatched\tgenotypes\tagree')
    for k in sorted(bands):
        c = bands[k]
        print(f"{k}\t{c['matched']}\t{c['unmatched']}\t{c['genotypes']}\t{c['agree'] / max(1, c['genotypes']):.3f}")
    print('1KGP dosage by sidecar dosage 0/1/2:')
    for d in range(3):
        print(f'  {d}: ' + ' '.join(str(confusion[(d, g)]) for g in range(3)))
    total = sum(confusion.values())
    nonref = sum(v for (d, g), v in confusion.items() if d or g)
    print(f'all genotypes agree {sum(confusion[(d, d)] for d in range(3)) / total:.3f}, '
          f'non-reference {(confusion[(1, 1)] + confusion[(2, 2)]) / nonref:.3f}')


if __name__ == '__main__':
    main()
