"""Each window's net size change per assembly, from the reference's flanks.

Usage: flankTruth.py <forms.jsonl> <ref.fa> <assembly path with {}> <names>
                     <out.tsv> [threads]
names: comma-separated, or @file with one per line; each replaces {} in the
assembly path.

Maps the FLANK bp just outside each window onto every assembly with minimap2
asm5. Where both flanks align uniquely (MAPQ >= 30, >= 90% of the flank) to one
contig in one orientation, the contig distance between them minus the window's
reference length is the assembly's net change, measured without aligning
anything inside the window. A window whose edge sits in a repeat is tried
wider, by OFFSETS, and the scorer sums the sidecar over the wider span.
"""

import json
import os
import subprocess
import sys
import tempfile

FLANK = 2000
MIN_MAPQ = 30
MIN_COVER = 0.9
OFFSETS = (0, 5000, 10000, 20000, 50000)


def spans(windows):
    for w in windows:
        if not w['rowSpan']:
            continue
        for d in OFFSETS:
            ws = min(w['start'], w['rowSpan'][0]) - d
            we = max(w['end'], w['rowSpan'][1]) + d
            if ws >= FLANK:
                yield f"{w['name']}|{d}", w['chrom'], ws, we


def flank_fasta(ref, todo, path):
    regions = []
    for _, chrom, ws, we in todo:
        regions += [f'{chrom}:{ws - FLANK + 1}-{ws}', f'{chrom}:{we + 1}-{we + FLANK}']
    names = iter(f'{key}|{side}' for key, *_ in todo for side in 'LR')
    seq = subprocess.run(['samtools', 'faidx', ref, *regions], capture_output=True,
                         text=True, check=True).stdout
    with open(path, 'w') as f:
        for line in seq.splitlines():
            f.write(f'>{next(names)}\n' if line.startswith('>') else line + '\n')


def inner_edges(paf):
    """Each flank's unique hit as (contig, strand, contig position of its inner edge)."""
    hits = {}
    for line in paf.splitlines():
        c = line.split('\t')
        name, qlen, qs, qe, strand, contig = c[0], int(c[1]), int(c[2]), int(c[3]), c[4], c[5]
        ts, te, mapq = int(c[7]), int(c[8]), int(c[11])
        if name in hits:
            hits[name] = 'multi'
        elif mapq < MIN_MAPQ or qe - qs < MIN_COVER * qlen:
            hits[name] = 'weak'
        elif name.endswith('|L'):
            hits[name] = (contig, strand, te + (qlen - qe) if strand == '+' else ts - (qlen - qe))
        else:
            hits[name] = (contig, strand, ts - qs if strand == '+' else te + qs)
    return hits


def net(left, right, ws, we):
    if not isinstance(left, tuple) or not isinstance(right, tuple):
        return f'L:{left if not isinstance(left, tuple) else "ok"} R:{right if not isinstance(right, tuple) else "ok"}', ''
    if left[:2] != right[:2]:
        return 'discordant', ''
    span = right[2] - left[2] if left[1] == '+' else left[2] - right[2]
    return ('ok', span - (we - ws)) if span >= 0 else ('disordered', '')


def main():
    forms, ref, pattern, names, out = sys.argv[1:6]
    threads = sys.argv[6] if len(sys.argv) > 6 else '8'
    names = open(names[1:]).read().split() if names.startswith('@') else names.split(',')
    todo = list(spans(json.loads(l) for l in open(forms)))
    fa = os.path.join(tempfile.mkdtemp(dir=os.path.dirname(os.path.abspath(out))), 'flanks.fa')
    flank_fasta(ref, todo, fa)
    with open(out, 'w') as o:
        o.write('window\toffset\tchrom\tws\twe\tmember\tstatus\tnet\n')
        for name in names:
            paf = subprocess.run(['minimap2', '-cx', 'asm5', '-t', threads, '--secondary=no',
                                  pattern.replace('{}', name), fa],
                                 capture_output=True, text=True, check=True).stdout
            hits = inner_edges(paf)
            for key, chrom, ws, we in todo:
                status, change = net(hits.get(f'{key}|L'), hits.get(f'{key}|R'), ws, we)
                window, offset = key.split('|')
                o.write(f'{window}\t{offset}\t{chrom}\t{ws}\t{we}\t{name}\t{status}\t{change}\n')
            print(f'{name} done', file=sys.stderr, flush=True)


if __name__ == '__main__':
    main()
