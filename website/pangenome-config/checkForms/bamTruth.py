"""Each window's net size change per haplotype, from its assembly's alignment.

Usage: bamTruth.py <forms.jsonl> <haplotypes> <bam url with {sample} {hap}>
                   <index cache dir> <out.tsv> [jobs]
haplotypes: comma-separated SAMPLE#N, or @file with one per line.

Fetches each haplotype's records over every window from an indexed BAM of its
assembly aligned to the reference (HPRC's winnowmap BAMs on S3), projects the
window's two edges through the CIGAR to contig positions, and reports the
contig distance between them minus the reference's.

- **An edge must map to one contig position.** A tandem duplication aligns its
  copy in a second, overlapping record, so an edge inside the copy measures
  through one copy only; FCGR's 82 kb duplication read as no change that way.
- An edge that maps nowhere or twice is tried wider, by OFFSETS, and the scorer
  sums the sidecar over the wider span.
"""

import json
import os
import re
import subprocess
import sys
from concurrent.futures import ThreadPoolExecutor

OFFSETS = (0, 5000, 10000, 20000, 50000, 100000)
# htslib with libcurl; the system samtools reads no https
SAMTOOLS = os.environ.get('SAMTOOLS', os.path.expanduser('~/.local/bin/samtools'))
CIGAR = re.compile(r'(\d+)([MIDNSHP=X])')


def project(pos, cigar, points):
    """Query offset of each 0-based reference point the record covers."""
    r, q, out = pos - 1, 0, {}
    pts = sorted(p for p in points if p >= r)
    k = 0
    for n, op in CIGAR.findall(cigar):
        n = int(n)
        if op in 'SHI':
            q += n
        elif op in 'M=XDN':
            while k < len(pts) and pts[k] < r + n:
                out[pts[k]] = q + (pts[k] - r if op in 'M=X' else 0)
                k += 1
            r += n
            if op in 'M=X':
                q += n
        if k == len(pts):
            break
    return out


def distinct(hits):
    """Contig positions an edge maps to; records within 100 bp of each other count once."""
    out = []
    for h in sorted(hits):
        if not (out and out[-1][:2] == h[:2] and h[2] - out[-1][2] <= 100):
            out.append(h)
    return out


def measure(w, records):
    edges = {d: (w['ws'] - d, w['we'] + d) for d in OFFSETS}
    points = [p for pair in edges.values() for p in pair]
    hits = {p: [] for p in points}
    for contig, flag, chrom, pos, cigar in records:
        if chrom == w['chrom']:
            for p, q in project(pos, cigar, points).items():
                hits[p].append((contig, flag & 16, q))
    tried = []
    for d, (a, b) in edges.items():
        ha, hb = distinct(hits[a]), distinct(hits[b])
        if len(ha) != 1 or len(hb) != 1:
            tried.append(f'{d}:{len(ha)}x{len(hb)}')
        elif ha[0][:2] != hb[0][:2] or hb[0][2] < ha[0][2]:
            tried.append(f'{d}:discordant')
        else:
            return d, a, b, 'ok', (hb[0][2] - ha[0][2]) - (b - a)
    return '', w['ws'], w['we'], 'no unique edges ' + ','.join(tried[:3]), ''


def one(hap, windows, template, cache):
    sample, n = hap.split('#')
    url = template.format(sample=sample, hap=n)
    regions = [f"{w['chrom']}:{max(1, w['ws'] - OFFSETS[-1])}-{w['we'] + OFFSETS[-1] + 1}"
               for w in windows]
    p = subprocess.run([SAMTOOLS, 'view', '-F', '0x100', '-X', url, url + '.bai', *regions],
                       capture_output=True, text=True, cwd=cache)
    if p.returncode:
        return [(w['name'], '', w['chrom'], w['ws'], w['we'], hap, 'fetch failed', '')
                for w in windows]
    records = set()
    for line in p.stdout.splitlines():
        c = line.split('\t', 6)
        records.add((c[0], int(c[1]), c[2], int(c[3]), c[5]))
    rows = []
    for w in windows:
        d, a, b, status, change = measure(w, records)
        rows.append((w['name'], d, w['chrom'], a, b, hap, status, change))
    return rows


def main():
    forms, haps, template, cache, out = sys.argv[1:6]
    jobs = int(sys.argv[6]) if len(sys.argv) > 6 else 8
    haps = open(haps[1:]).read().split() if haps.startswith('@') else haps.split(',')
    windows = []
    for line in open(forms):
        w = json.loads(line)
        if w['rowSpan']:
            w['ws'] = min(w['start'], w['rowSpan'][0])
            w['we'] = max(w['end'], w['rowSpan'][1])
            windows.append(w)
    os.makedirs(cache, exist_ok=True)
    with open(out, 'w') as o, ThreadPoolExecutor(jobs) as ex:
        o.write('window\toffset\tchrom\tws\twe\tmember\tstatus\tnet\n')
        for i, rows in enumerate(ex.map(lambda h: one(h, windows, template, cache), haps), 1):
            o.writelines('\t'.join(map(str, r)) + '\n' for r in rows)
            if i % 25 == 0:
                print(f'{i}/{len(haps)} haplotypes', file=sys.stderr, flush=True)


if __name__ == '__main__':
    main()
