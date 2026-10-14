"""Collapse a split SV callset's same-site alleles that are one event.

Usage: collapseSiteAlleles.py [members.tsv] < split.vcf > collapsed.vcf

Reads an uncompressed one-allele-per-record VCF. Records sharing CHROM, POS
and REF length are one site; a sorted VCF may interleave REF lengths at one
POS, so the whole POS is read before grouping. Within a site, alleles of one
SV type (INV by SVTYPE, else INS or DEL by length change) merge into one
record when:

- their sizes are within PCTSIZE of the cluster's smallest (length change for
  INS/DEL, ALT length for INV, whose REF is the site's)
- for DEL, their ALTs (the sequence the deletion leaves) also differ by less
  than RESIDUAL_BP, so a deletion that leaves 1.4 kb of new sequence stays
  apart from a clean one of the same size

The merged record takes ALT and INFO from the member with the most carrier
haplotypes, plus the union of CONFLICT and NumCollapsed. A haplotype carries it
if it carried any member, is reference if called reference on any member, and
is missing otherwise. AC/AF/AN are stale until `bcftools +fill-tags`.

members.tsv, when named, gets one line per output record: CHROM, POS, its
ordinal among the POS's output records, and the comma-joined ordinals of the
input records it holds, so a checker can audit each merge.
"""

import sys

PCTSIZE = 0.95
RESIDUAL_BP = 50


def sv_type(ref, alt, info):
    if 'SVTYPE=INV' in info.split(';'):
        return 'INV'
    return 'INS' if len(alt) > len(ref) else 'DEL'


def sv_size(ref, alt, kind):
    return len(alt) if kind == 'INV' else abs(len(alt) - len(ref))


def carriers(gts):
    return sum(
        a not in ('0', '.')
        for g in gts
        for a in g.split(':')[0].replace('/', '|').split('|')
    )


def merge_gt(gts):
    alleles = [g.split(':')[0] for g in gts]
    split = [a.replace('/', '|').split('|') for a in alleles]
    ploidy = max(len(s) for s in split)
    # an unphased call with no alt (`0/0`, `./.`) carries no phase to lose
    if any(
        '/' in a and any(c not in ('0', '.') for c in s)
        for a, s in zip(alleles, split)
    ):
        # An unphased position is no haplotype, so count instead: two members
        # each `0/1` carry one alt apiece, which is `1/1` of the merged allele.
        n_alt = min(ploidy, sum(c not in ('0', '.') for s in split for c in s))
        called = max(sum(c != '.' for c in s) for s in split)
        n_ref = max(0, called - n_alt)
        return '/'.join(
            ['0'] * n_ref + ['1'] * n_alt + ['.'] * (ploidy - n_ref - n_alt)
        )
    out = []
    for hp in range(ploidy):
        calls = [s[hp] for s in split if hp < len(s)]
        if any(c not in ('0', '.') for c in calls):
            out.append('1')
        elif '0' in calls:
            out.append('0')
        else:
            out.append('.')
    # every member unphased and carrying nothing: claim no phase either
    return ('/' if all('/' in a for a in alleles) else '|').join(out)


def greedy(recs, measure, fits):
    recs = sorted(recs, key=measure)
    clusters = [[recs[0]]]
    for rec in recs[1:]:
        if fits(measure(clusters[-1][0]), measure(rec)):
            clusters[-1].append(rec)
        else:
            clusters.append([rec])
    return clusters


def clusters_of(recs, kind):
    groups = (
        greedy(recs, lambda r: len(r['fields'][4]), lambda lo, hi: hi - lo < RESIDUAL_BP)
        if kind == 'DEL'
        else [recs]
    )
    return [
        cluster
        for group in groups
        for cluster in greedy(group, lambda r: r['size'], lambda lo, hi: lo >= PCTSIZE * hi)
    ]


def flush(site, out, members):
    groups = {}
    for rec in site:
        groups.setdefault((len(rec['fields'][3]), rec['kind']), []).append(rec)
    merged = [
        cluster
        for (_, kind), recs in groups.items()
        for cluster in clusters_of(recs, kind)
    ]
    merged.sort(key=lambda c: min(r['order'] for r in c))
    for ordinal, cluster in enumerate(merged):
        rep = max(cluster, key=lambda r: (r['carriers'], -r['order']))
        f = list(rep['fields'])
        if len(cluster) > 1:
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
                if kv != '.' and not kv.startswith('CONFLICT=')
            ]
            if conflict:
                info.append('CONFLICT=' + ','.join(conflict))
            info.append(f'NumCollapsed={len(cluster)}')
            f[7] = ';'.join(info)
            f[8] = 'GT'
            per_sample = zip(*(r['fields'][9:] for r in cluster))
            f[9:] = [merge_gt(list(gts)) for gts in per_sample]
        out.write('\t'.join(f) + '\n')
        if members:
            ords = ','.join(str(r['order']) for r in sorted(cluster, key=lambda r: r['order']))
            members.write(f'{f[0]}\t{f[1]}\t{ordinal}\t{ords}\n')


def main():
    out = sys.stdout
    members = open(sys.argv[1], 'w') if len(sys.argv) > 1 else None
    site, key = [], None
    for line in sys.stdin:
        if line.startswith('##'):
            out.write(line)
            continue
        if line.startswith('#'):
            out.write(
                '##INFO=<ID=NumCollapsed,Number=1,Type=Integer,'
                'Description="Same-site alleles of one SV type and size merged into this record">\n'
            )
            out.write(line)
            continue
        f = line.rstrip('\n').split('\t')
        k = (f[0], f[1])
        if k != key:
            flush(site, out, members)
            site, key = [], k
        kind = sv_type(f[3], f[4], f[7])
        site.append(
            {
                'fields': f,
                'kind': kind,
                'size': sv_size(f[3], f[4], kind),
                'carriers': carriers(f[9:]),
                'order': len(site),
            }
        )
    flush(site, out, members)
    if members:
        members.close()


main()
