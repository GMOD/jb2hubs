// Each informative site the page groups a window's haplotypes by, with what
// every form claims there, one JSON line per site, for bamTruth.py or
// flankTruth.py to measure and scoreSites.py to score.
//
//   node printSites.ts <sidecar.tsv.gz> <windows.tsv> > sites.jsonl
//
// Each site is padded by PAD_BP, so a change the aligner placed a few hundred bp
// from the graph's site still falls inside; the claim there sums every site the
// padded span holds.
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
  // Each site padded on its own, then grown only to take in a site its edge
  // cuts, so a dense locus still gives one cluster per site. A restored
  // parent that holds the whole span is left out; scoreSites.py scores its
  // carriers apart.
  const sites = result.informativeSites
  const clusters = new Map<
    string,
    { start: number; end: number; sites: Set<number> }
  >()
  sites.forEach(site => {
    let ps = site.start - PAD_BP
    let pe = site.end + PAD_BP
    for (let grown = true; grown;) {
      grown = false
      for (const o of sites) {
        const holds = o.start <= ps && o.end >= pe
        const cut =
          !holds &&
          ((o.start < ps && o.end > ps) || (o.start < pe && o.end > pe))
        if (cut) {
          ps = Math.min(ps, o.start)
          pe = Math.max(pe, o.end)
          grown = true
        }
      }
    }
    const inside = new Set(
      sites.flatMap((o, i) => (o.start >= ps && o.end <= pe ? [i] : [])),
    )
    clusters.set(`${ps}-${pe}`, { start: ps, end: pe, sites: inside })
  })
  ;[...clusters.values()].forEach((c, k) => {
    const ps = c.start
    const pe = c.end
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
