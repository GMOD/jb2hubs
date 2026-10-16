"""Merge one snarl's records that state one event at different anchors.

Usage: mergeSnarlEvents.py [members.tsv] < collapsed.vcf > merged.vcf

Reads the uncompressed output of collapseSiteAlleles.py for one chromosome.
vcfwave anchors an event at a different base for each sequence variant of it,
so GSTT1's 54 kb insertion is six records within 733 bp and LCE3's 32 kb
deletion two records 4 bp apart, each holding a share of the carriers. Records
merge when they:

- name one snarl: the ID's first `;` field, less vcfwave's `_<n>` suffix
- are one SV type with sizes within PCTSIZE of each other, and deletions leave
  ALTs within RESIDUAL_BP of each other, as collapseSiteAlleles.py merges
- start within the event's size, MIN_REACH at least, of the cluster's end, the
  reach mergeSplitEvents in pangenomeSvStates.ts gives the map
- share no carrier haplotype, so a haplotype with two copies keeps both, and
  have no unphased carrier, whose haplotype cannot be told

The merged record takes the fields of the member with the most carriers, the
union of CONFLICT and NumCollapsed summed. A haplotype carries it if it carried
any member, is reference if called reference on any, and is missing otherwise.
Output is sorted by POS. AC/AF/AN are stale until `bcftools +fill-tags`.

members.tsv, when named, gets one line per output record: CHROM, POS and the
comma-joined ordinals of the input records it holds.
"""

import sys

PCTSIZE = 0.95
RESIDUAL_BP = 50
MIN_REACH = 1000
NUM_COLLAPSED = (
    '##INFO=<ID=NumCollapsed,Number=1,Type=Integer,'
    'Description="Alleles of one SV type and size merged into this record, '
    'at one site or across one snarl\'s anchors">\n'
)


def snarl_of(rec_id):
    first = rec_id.split(';')[0]
    if first == '.':
        return None
    head, _, tail = first.rpartition('_')
    return head if head and tail.isdigit() else first


def kind_and_size(f):
    if 'SVTYPE=INV' in f[7].split(';'):
        return 'INV', len(f[4])
    delta = len(f[4]) - len(f[3])
    return ('INS' if delta > 0 else 'DEL'), abs(delta)


def phased_carriers(gts):
    """The carrier haplotypes, or None when a carrier's call is unphased."""
    out = set()
    for i, g in enumerate(gts):
        a = g.split(':')[0]
        calls = a.replace('/', '|').split('|')
        alts = [hp for hp, c in enumerate(calls) if c not in ('0', '.')]
        if alts and '/' in a:
            return None
        out.update((i, hp) for hp in alts)
    return out


def merge_gt(gts):
    alleles = [g.split(':')[0] for g in gts]
    split = [a.replace('/', '|').split('|') for a in alleles]
    out = []
    for hp in range(max(len(s) for s in split)):
        calls = [s[hp] for s in split if hp < len(s)]
        if any(c not in ('0', '.') for c in calls):
            out.append('1')
        elif '0' in calls:
            out.append('0')
        else:
            out.append('.')
    return ('/' if all('/' in a for a in alleles) else '|').join(out)


def fits(cluster, rec):
    first = cluster[0]
    if rec['snarl'] is None or rec['snarl'] != first['snarl'] or rec['kind'] != first['kind']:
        return False
    if rec['carriers'] is None or any(r['carriers'] is None for r in cluster):
        return False
    sizes = [r['size'] for r in cluster] + [rec['size']]
    if min(sizes) < PCTSIZE * max(sizes):
        return False
    if rec['kind'] == 'DEL':
        alts = [len(r['fields'][4]) for r in cluster] + [len(rec['fields'][4])]
        if max(alts) - min(alts) >= RESIDUAL_BP:
            return False
    if rec['pos'] - max(r['end'] for r in cluster) > max(max(sizes), MIN_REACH):
        return False
    return not any(rec['carriers'] & r['carriers'] for r in cluster)


def num_collapsed(info):
    for kv in info.split(';'):
        if kv.startswith('NumCollapsed='):
            return int(kv[len('NumCollapsed=') :])
    return 1


def representative(cluster):
    return max(cluster, key=lambda r: (len(r['carriers'] or ()), -r['order']))


def emit(cluster):
    if len(cluster) == 1:
        return cluster[0]['fields']
    f = list(representative(cluster)['fields'])
    conflict = sorted(
        {
            name
            for r in cluster
            for kv in r['fields'][7].split(';')
            if kv.startswith('CONFLICT=')
            for name in kv[len('CONFLICT=') :].split(',')
        }
    )
    info = [
        kv
        for kv in f[7].split(';')
        if kv != '.' and not kv.startswith(('CONFLICT=', 'NumCollapsed='))
    ]
    if conflict:
        info.append('CONFLICT=' + ','.join(conflict))
    info.append(f'NumCollapsed={sum(num_collapsed(r["fields"][7]) for r in cluster)}')
    f[7] = ';'.join(info)
    f[8] = 'GT'
    f[9:] = [merge_gt(list(gts)) for gts in zip(*(r['fields'][9:] for r in cluster))]
    return f


def main():
    out = sys.stdout
    members = open(sys.argv[1], 'w') if len(sys.argv) > 1 else None
    clusters = []
    by_snarl = {}
    order = 0
    for line in sys.stdin:
        if line.startswith('##INFO=<ID=NumCollapsed,'):
            continue
        if line.startswith('##'):
            out.write(line)
            continue
        if line.startswith('#'):
            out.write(NUM_COLLAPSED)
            out.write(line)
            continue
        f = line.rstrip('\n').split('\t')
        kind, size = kind_and_size(f)
        rec = {
            'fields': f,
            'order': order,
            'pos': int(f[1]),
            'end': int(f[1]) + len(f[3]) - 1,
            'snarl': snarl_of(f[2]),
            'kind': kind,
            'size': size,
            'carriers': phased_carriers(f[9:]),
        }
        order += 1
        candidates = [c for c in by_snarl.get(rec['snarl'], []) if fits(c, rec)]
        if candidates:
            max(candidates, key=lambda c: max(r['end'] for r in c)).append(rec)
        else:
            clusters.append([rec])
            if rec['snarl'] is not None:
                by_snarl.setdefault(rec['snarl'], []).append(clusters[-1])
    clusters.sort(key=lambda c: (representative(c)['pos'], c[0]['order']))
    for cluster in clusters:
        f = emit(cluster)
        out.write('\t'.join(f) + '\n')
        if members:
            members.write(f"{f[0]}\t{f[1]}\t{','.join(str(r['order']) for r in cluster)}\n")
    if members:
        members.close()


main()
