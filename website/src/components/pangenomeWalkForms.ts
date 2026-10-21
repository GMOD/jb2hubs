// A window's structural forms read off the graph's walk file (`gfa-to-tabix
// --walks`) by @jbrowse/graph-walks: each haplotype's exact departures from the
// reference, grouped into the forms that make the same changes. The result has
// the sidecar's shape, so the panel, headline and map read either.
//
// Walks give exact lengths, where the sidecar rounds the callset's to two
// figures and loses some: summed per haplotype over the forms check's windows
// they match the assemblies in every scored case (graph-walks
// docs/structural-forms.md), and at HBA they draw the −α3.7 deletion as one
// form where the sidecar split the window into 17 forms of small insertions.

import {
  NO_CALL_STATE,
  RARER_STATE,
  REFERENCE_STATE,
  formsCut,
  structuralForms,
} from '@jbrowse/graph-walks'

import { walkReader } from './pangenomeWalkCut.ts'

import type {
  SiteMark as StructuralSiteMark,
  StructuralFormsResult,
} from './pangenomeSvStates.ts'
import type { ParsedRegion } from './pangenomeRegion.ts'
import type { SiteMark, StructuralForms } from '@jbrowse/graph-walks'

// A sample the walk file carries beside the panel, which no form should hold:
// HPRC's graph walks CHM13 as a haplotype.
const EXCLUDED_SAMPLES = ['CHM13']

// With `nearlyPure`, a replacement whose smaller side is under this share of
// its larger reads as the deletion or insertion it nearly is: C4's short gene
// is 6.46 kb replaced by 94 bp, and CYP2D6's extra copy 178 bp replaced by
// 13.9 kb. Off by default until Colin rules on it, since he asked that a
// replacement read differently from an insertion at a site.
const NEARLY_PURE = 0.05

export interface WalkFormsOptions {
  nearlyPure?: boolean
}

function pageMark(
  m: SiteMark,
  site: number,
  { nearlyPure = false }: WalkFormsOptions,
): StructuralSiteMark {
  const bp = Math.abs(m.delta)
  const common = { site, start: m.refStart, end: m.refEnd }
  const ref = m.refEnd - m.refStart
  const kind =
    nearlyPure &&
    m.kind === 'replacement' &&
    Math.min(ref, m.altLength) < NEARLY_PURE * Math.max(ref, m.altLength)
      ? m.delta < 0
        ? 'deletion'
        : 'insertion'
      : m.kind
  switch (kind) {
    case 'shift':
      return { ...common, kind: 'shifted', bp: m.shiftedBp ?? bp }
    case 'duplication': {
      const [start, end] = m.copied ?? [m.refStart, m.refEnd]
      return { site, start, end, kind: 'duplication', bp }
    }
    case 'net':
      return { ...common, kind: 'replacement', bp, gain: m.delta > 0, net: true }
    case 'replacement':
      return { ...common, kind: 'replacement', bp, gain: m.delta > 0 }
    case 'inversion':
      return { ...common, kind: 'inversion', bp: 0 }
    default:
      return { ...common, kind, bp }
  }
}

// The sites a form's marks or states name, in reference order, numbered as
// the page numbers informative sites
function pageSites(result: StructuralForms) {
  const named = new Set(result.informative)
  for (const f of result.forms) {
    for (const m of f.marks) {
      named.add(m.site)
    }
  }
  return [...named].sort(
    (a, b) => result.sites[a]!.refStart - result.sites[b]!.refStart,
  )
}

export function walkFormsResult(
  result: StructuralForms,
  opts: WalkFormsOptions = {},
): StructuralFormsResult {
  const order = pageSites(result)
  const index = new Map(order.map((s, i) => [s, i]))
  const forms = result.forms.map(f => {
    const stateMarks = result.informative.flatMap((s, k): StructuralSiteMark[] => {
      const state = f.states[k]
      const site = result.sites[s]!
      const common = { site: index.get(s)!, start: site.refStart, end: site.refEnd, bp: 0 }
      return state === NO_CALL_STATE
        ? [{ ...common, kind: 'uncalled' }]
        : state === RARER_STATE
          ? [{ ...common, kind: 'rarer' }]
          : []
    })
    const marks = [
      ...f.marks.map(m => pageMark(m, index.get(m.site)!, opts)),
      ...stateMarks,
    ].sort((a, b) => a.start - b.start)
    const sized = marks.filter(m =>
      ['deletion', 'insertion', 'replacement', 'duplication'].includes(m.kind),
    )
    return {
      members: f.members,
      key: f.key,
      deltas: sized
        .map(m => (m.kind === 'deletion' || (m.kind === 'replacement' && !m.gain) ? -m.bp : m.bp))
        .sort((a, b) => Math.abs(b) - Math.abs(a)),
      inversions: marks.filter(m => m.kind === 'inversion').length,
      uncalled: stateMarks.filter(m => m.kind === 'uncalled').length,
      rarer: stateMarks.filter(m => m.kind === 'rarer').length,
      bypassed: 0,
      marks,
    }
  })
  return {
    sites: result.sites.filter(s => !s.edge).length,
    informative: result.informative.length,
    informativeSites: order.map(s => {
      const site = result.sites[s]!
      return { start: site.refStart, end: site.refEnd, aligned: site.covered }
    }),
    forms,
    unplaced: result.unplaced,
    rareCarriers: result.rareCarriers,
    nonReferenceMajority: result.sites.filter(
      s =>
        !s.edge &&
        s.states.reduce((a, b) => (b.carriers.length > a.carriers.length ? b : a))
          .key !== REFERENCE_STATE,
    ).length,
    minCarriers: result.minCarriers,
  }
}

export async function readWalkForms(
  walksUrl: string,
  region: ParsedRegion,
  signal?: AbortSignal,
  opts: WalkFormsOptions = {},
) {
  const window = { refName: region.chrom, start: region.start, end: region.end }
  const haplotypes = await formsCut(walkReader(walksUrl), window, { signal })
  return walkFormsResult(
    structuralForms(haplotypes, {
      window: { start: region.start, end: region.end },
      exclude: EXCLUDED_SAMPLES,
    }),
    opts,
  )
}
