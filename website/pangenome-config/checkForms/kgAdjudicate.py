"""Measure each kgDisputes.py pair's deletion span in that sample's two
assemblies with bamTruth.one, fetching each haplotype's own windows only.
kgVerdicts.py scores the output.

Usage: kgAdjudicate.py <pairs.jsonl> <bam url template> <cache> <out.tsv> [jobs]
"""
import json
import os
import sys
from collections import defaultdict
from concurrent.futures import ThreadPoolExecutor

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import bamTruth

pairs, template, cache, out = sys.argv[1:5]
jobs = int(sys.argv[5]) if len(sys.argv) > 5 else 8
os.makedirs(cache, exist_ok=True)
byhap = defaultdict(list)
for line in open(pairs):
    w = json.loads(line)
    for n in ('1', '2'):
        byhap[f"{w['sample']}#{n}"].append(w)
with open(out, 'w') as o, ThreadPoolExecutor(jobs) as ex:
    o.write('window\toffset\tchrom\tws\twe\tmember\tstatus\tnet\n')
    for i, rows in enumerate(ex.map(lambda h: bamTruth.one(h, byhap[h], template, cache), list(byhap)), 1):
        o.writelines('\t'.join(map(str, r)) + '\n' for r in rows)
        if i % 100 == 0:
            print(f'{i}/{len(byhap)}', file=sys.stderr, flush=True)
