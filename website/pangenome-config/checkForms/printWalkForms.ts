// The walk forms of each window, in printForms.ts' JSON lines, for
// `scoreForms.py --complete-claims` to check against the assemblies.
//
//   node printWalkForms.ts <windows.tsv> [--floor 50|auto] [--truth truth.tsv]
//     [--walks url] [--exclude CHM13] [--keep-rare] > forms.jsonl
//
// --keep-rare keeps forms under minCarriers apart (foldRareForms: false), as
// the scorer counts folded members apart anyway.
//
// windows.tsv: name chrom start end, 0-based half-open. With --truth, each
// window also gets `spans`, keyed `ws-we` for each span the truth table
// measured: every haplotype's own net change over the span, and its net there
// from changes that do not touch the window. Either is null where its walks
// do not cross the span whole.
import fs from 'fs'
import { parseArgs } from 'util'

import { STRUCTURAL_BP, formsCut, structuralForms } from '@jbrowse/graph-walks'

import { HPRC_DATASET } from '../../src/components/pangenomeDataset.ts'
import { walkReader } from '../../src/components/pangenomeWalkCut.ts'

import type { HaplotypeDepartures } from '@jbrowse/graph-walks'

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    floor: { type: 'string', default: 'auto' },
    truth: { type: 'string' },
    walks: { type: 'string', default: HPRC_DATASET.walksUrl },
    exclude: { type: 'string', default: 'CHM13' },
    'keep-rare': { type: 'boolean', default: false },
  },
})
const [windowsFile] = positionals
if (!windowsFile || !values.walks) {
  throw new Error(
    'usage: node printWalkForms.ts <windows.tsv> [--floor 50|auto] [--truth truth.tsv] [--walks url] [--exclude names] [--keep-rare]',
  )
}
const floorBp = values.floor === 'auto' ? 'auto' : Number(values.floor)
const exclude = values.exclude.split(',').filter(Boolean)
const reader = walkReader(values.walks)

type Window = { start: number; end: number }

const truthSpans = new Map<string, Set<string>>()
if (values.truth) {
  const [header = '', ...rows] = fs
    .readFileSync(values.truth, 'utf8')
    .trim()
    .split('\n')
  const col = Object.fromEntries(header.split('\t').map((c, i) => [c, i]))
  for (const row of rows) {
    const c = row.split('\t')
    if (c[col.status!] === 'ok') {
      const name = c[col.window!]!
      const spans = truthSpans.get(name) ?? new Set()
      spans.add(`${c[col.ws!]}-${c[col.we!]}`)
      truthSpans.set(name, spans)
    }
  }
}

const covers = (h: HaplotypeDepartures, a: number, b: number) =>
  a >= b || h.covered.some(([s, e]) => s <= a && e >= b)

// Departures nearer than structuralForms' join, joined as it joins them
function joined(h: HaplotypeDepartures) {
  const out: { refStart: number; refEnd: number; delta: number }[] = []
  let lastAbridged = true
  for (const d of h.departures) {
    const delta = d.altLength - (d.refEnd - d.refStart)
    const last = out.at(-1)
    if (
      last &&
      !lastAbridged &&
      !d.abridged &&
      d.refStart - last.refEnd < STRUCTURAL_BP
    ) {
      last.refEnd = Math.max(last.refEnd, d.refEnd)
      last.delta += delta
    } else {
      out.push({ refStart: d.refStart, refEnd: d.refEnd, delta })
    }
    lastAbridged = !!d.abridged
  }
  return out
}

// The haplotype's net over [ws, we], and its net there from changes that do
// not touch the window, which the form's marks leave out
function spanNets(
  h: HaplotypeDepartures,
  ws: number,
  we: number,
  window: Window,
) {
  let net: number | null = covers(h, ws, we) ? 0 : null
  let beyond: number | null =
    covers(h, ws, window.start) && covers(h, window.end, we) ? 0 : null
  for (const g of joined(h)) {
    if (g.refEnd <= ws || g.refStart >= we) {
      continue
    }
    const inside = g.refStart >= ws && g.refEnd <= we
    net = inside && net !== null ? net + g.delta : null
    if (g.refEnd < window.start || g.refStart > window.end) {
      beyond = inside && beyond !== null ? beyond + g.delta : null
    }
  }
  return { net, beyond }
}

async function spansOf(name: string, refName: string, window: Window) {
  const out: Record<string, Record<string, ReturnType<typeof spanNets>>> = {}
  for (const span of truthSpans.get(name) ?? []) {
    const [ws, we] = span.split('-').map(Number) as [number, number]
    const haplotypes = await formsCut(reader, { refName, start: ws, end: we })
    out[span] = Object.fromEntries(
      haplotypes.map(h => [h.haplotype, spanNets(h, ws, we, window)]),
    )
  }
  return out
}

for (const line of fs.readFileSync(windowsFile, 'utf8').trim().split('\n')) {
  const [name = '', chrom = '', s, e] = line.split(/\s+/)
  const window: Window = { start: Number(s), end: Number(e) }
  const haplotypes = await formsCut(reader, { refName: chrom, ...window })
  const result = structuralForms(haplotypes, {
    window,
    floorBp,
    exclude,
    foldRareForms: !values['keep-rare'],
  })
  const sites = result.informative.map(i => result.sites[i]!)
  const marks = result.forms.flatMap(f => f.marks)
  const extent = [...sites, ...marks]
  process.stdout.write(
    `${JSON.stringify({
      name,
      chrom,
      ...window,
      rowSpan: [
        Math.min(window.start, ...extent.map(m => m.refStart)),
        Math.max(window.end, ...extent.map(m => m.refEnd)),
      ],
      floorBp: result.floorBp,
      unplaced: result.unplaced,
      rareCarriers: result.rareCarriers,
      lanes: result.forms.length,
      forms: result.forms.map(f => ({
        members: f.members,
        deltas: f.marks.map(m => m.delta),
        marks: f.marks.map(m => ({
          kind: m.kind,
          bp: m.delta,
          start: m.refStart,
          end: m.refEnd,
        })),
        unsized: f.states.filter(st => st === '.' || st === '~').length,
      })),
      ...(values.truth ? { spans: await spansOf(name, chrom, window) } : {}),
    })}\n`,
  )
}
