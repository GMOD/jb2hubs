"""Share of HPRC haplotypes carrying each well-studied structural allele, by
1000 Genomes superpopulation, for comparison with published frequencies.

Usage: popFreq.py <sidecar.tsv.gz> <1kgp ped population file>
ped: 20130606_g1k_3202_samples_ped_population.txt from the 1000 Genomes
high-coverage collection. Samples it does not list (HG002, HG005 and seven
others) count under '?'.

Each event names the sidecar rows that carry it and the states that count.
A haplotype with a no call at the event's row is left out. The interval after
each share is a 95% Wilson interval.
"""

import gzip
import sys
from collections import Counter, defaultdict

POPS = ['ALL', 'AFR', 'AMR', 'EAS', 'EUR', 'SAS', '?']

# GSTM1's deletion at 109,682,997 and the reinsertions of the gene nearby
GSTM1_INSERTIONS = (109700985, 109701046, 109701701, 109701772, 109701996, 109702072, 109702370)
GSTT1_INSERTIONS = (24000855, 24000946, 24001378, 24001390, 24001510, 24001588)
C4_RANGE = (31980000, 32035000)


def read(path):
    rows = {}
    with gzip.open(path, 'rt') as f:
        haps = f.readline().rstrip('\n').split('\t')[1].split(',')
        for line in f:
            c = line.rstrip('\n').split('\t')
            sizes = {}
            if c[4] != '.':
                for kv in c[4].split(','):
                    k, v = kv.split(':', 1)
                    sizes[k] = int(v) if v.lstrip('+-').isdigit() else v
            rows.setdefault((c[0], int(c[1])), []).append((sizes, c[5]))
    return haps, rows


def main():
    sidecar, ped = sys.argv[1:3]
    haps, rows = read(sidecar)
    pop = {}
    for line in open(ped).read().split('\n')[1:]:
        c = line.split()
        if c:
            pop[c[1]] = c[6]

    def state(chrom, start, i):
        (sizes, genotypes), = rows[(chrom, start)]
        return genotypes[i]

    def carried(chrom, start, states):
        def f(i):
            s = state(chrom, start, i)
            return None if s in '._~' else s in states
        return f

    def any_of(chrom, starts):
        return lambda i: any(state(chrom, p, i) not in '0._~' for p in starts)

    def gstm1_null(i):
        s = state('chr1', 109682997, i)
        return None if s in '._' else s == '1' and not any_of('chr1', GSTM1_INSERTIONS)(i)

    events = {
        'GSTM1 18 kb deletion, net of reinsertions': gstm1_null,
        'GSTT1 present (54 kb insertion; GRCh38 chr22 lacks it)': any_of('chr22', GSTT1_INSERTIONS),
        'GSTT2/GSTT2B 37 kb deletion': carried('chr22', 23931957, '1'),
        'UGT2B17 120 kb deletion': carried('chr4', 68508113, '1'),
        'HP 1.7 kb deletion (Hp1; GRCh38 is Hp2)': carried('chr16', 72057479, '1'),
        'RHD 70 kb deletion': carried('chr1', 25265417, '1'),
        'CFHR3-CFHR1 85 kb deletion': carried('chr1', 196758725, '1'),
        'HBA -alpha3.7 deletion (3,805 bp)': carried('chr16', 172417, '1'),
        'CYP2D6 12 kb deletion (*5)': carried('chr22', 42123230, '1'),
        'CYP2D6 extra 12-27 kb copy': lambda i: (lambda s: None if s in '._' else s != '0')(state('chr22', 42135057, i)),
        'FLNA-EMD inversion': carried('chrX', 154347246, 'v'),
    }
    groups = [pop.get(h.split('#')[0], '?') for h in haps]
    for name, f in events.items():
        t = defaultdict(Counter)
        for i, p in enumerate(groups):
            v = f(i)
            k = 'nc' if v is None else 'y' if v else 'n'
            t[p][k] += 1
            t['ALL'][k] += 1
        print(f'{name}\n   ' + ' | '.join(share(p, t[p]) for p in POPS if t[p]['y'] + t[p]['n']))
    c4(haps, rows, groups)


def share(p, c):
    n = c['y'] + c['n']
    q = c['y'] / n
    z = 1.96
    d = 1 + z * z / n
    m = (q + z * z / (2 * n)) / d
    h = z * ((q * (1 - q) / n + z * z / (4 * n * n)) ** 0.5) / d
    return f'{p} {q:.2f} [{m - h:.2f}-{m + h:.2f}] n={n}'


def c4(haps, rows, groups):
    """C4 genes per haplotype, from GRCh38's two: a 26 or 33 kb module gained
    adds one, a 33 kb one lost removes one, and a short gene lacks the 6.4 kb
    HERV. The sidecar splits a module swap over two rows, so only the sum per
    haplotype says how many genes it has."""
    region = sorted((k[1], v[0]) for k, v in rows.items()
                    if k[0] == 'chr6' and C4_RANGE[0] <= k[1] < C4_RANGE[1])
    genes = defaultdict(Counter)
    short = defaultdict(Counter)
    for i, p in enumerate(groups):
        n, s = 2, 0
        if any(g[i] in '._~' for _, (_, g) in region):
            continue
        for _, (sizes, g) in region:
            v = sizes.get(g[i]) if g[i] != '0' else None
            if not isinstance(v, int):
                continue
            if -34000 <= v <= -32000:
                n -= 1
            elif 25000 <= v <= 34000:
                n += 1
                s += v < 30000
            elif -6500 <= v <= -6300:
                s += 1
        for q in (p, 'ALL'):
            genes[q][n] += 1
            short[q]['short'] += s
            short[q]['all'] += n
    print('C4 genes per haplotype')
    for p in POPS:
        c = genes[p]
        t = sum(c.values())
        if t:
            dist = ' '.join(f'{k}:{v / t:.2f}' for k, v in sorted(c.items()))
            print(f"   {p} n={t} {dist} short genes {short[p]['short'] / short[p]['all']:.2f}")


if __name__ == '__main__':
    main()
