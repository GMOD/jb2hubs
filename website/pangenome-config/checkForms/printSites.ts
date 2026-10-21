// Each informative site the page groups a window's haplotypes by, with what
// every form claims there, one JSON line per site, for bamTruth.py or
// flankTruth.py to measure and scoreSites.py to score.
//
//   node printSites.ts <sidecar.tsv.gz> <windows.tsv> > sites.jsonl
//
// Sites closer than MERGE_BP are one cluster, padded by PAD_BP so a change the
// aligner placed a few hundred bp from the graph's site still falls inside.
import fs from 'fs'
import zlib from 'zlib'

import {
  minCarriersFor,
  parseSvStateRow,
  structuralForms,
} from '../../src/components/pangenomeSvStates.ts'

import type {
  SiteMark,
  SvStateRow,
} from '../../src/components/pangenomeSvStates.ts'

const MERGE_BP = 1000
const PAD_BP = 500

const [sidecar, windowsFile] = process.argv.slice(2)
if (!sidecar || !windowsFile) {
  throw new Error('usage: node printSites.ts <sidecar.tsv.gz> <windows.tsv>')
}

const [header = '', ...lines] = zlib
  .gunzipSync(fs.readFileSync(sidecar))
  .toString()
  .trim()
  .split('\n')
const haplotypes = header.split('\t')[1]!.split(',')
const byChrom = new Map<string, SvStateRow[]>()
for (const line of lines) {
  const row = parseSvStateRow(line)
  byChrom.set(row.chrom, [...(byChrom.get(row.chrom) ?? []), row])
}

const signed = (m: SiteMark) =>
  m.kind === 'deletion'
    ? -m.bp
    : m.kind === 'insertion'
      ? m.bp
      : m.kind === 'replacement'
        ? m.gain
          ? m.bp
          : -m.bp
        : 0
const unsized = (m: SiteMark) =>
  m.kind === 'uncalled' || m.kind === 'bypassed' || m.kind === 'rarer'

for (const line of fs.readFileSync(windowsFile, 'utf8').trim().split('\n')) {
  const [window, chrom = '', s, e] = line.split(/\s+/)
  const start = Number(s)
  const end = Number(e)
  const rows = (byChrom.get(chrom) ?? []).filter(
    r => r.start < end && r.end >= start,
  )
  const result = structuralForms(
    rows,
    haplotypes,
    minCarriersFor(haplotypes.length),
  )
  const clusters: { start: number; end: number; sites: Set<number> }[] = []
  result.informativeSites.forEach((site, i) => {
    const last = clusters.at(-1)
    if (last && site.start - last.end < MERGE_BP) {
      last.end = Math.max(last.end, site.end)
      last.sites.add(i)
    } else {
      clusters.push({ start: site.start, end: site.end, sites: new Set([i]) })
    }
  })
  clusters.forEach((c, k) => {
    const ps = c.start - PAD_BP
    const pe = c.end + PAD_BP
    process.stdout.write(
      `${JSON.stringify({
        name: `${window}:${k}`,
        window,
        chrom,
        start: ps,
        end: pe,
        rowSpan: [ps, pe],
        sites: c.sites.size,
        rareCarriers: result.rareCarriers,
        forms: result.forms.map(f => {
          const marks = f.marks.filter(m => c.sites.has(m.site))
          return {
            members: f.members,
            claim: marks.reduce((n, m) => n + signed(m), 0),
            unsized: marks.some(unsized),
          }
        }),
      })}\n`,
    )
  })
}
