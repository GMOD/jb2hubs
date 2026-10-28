// A window's structural forms read off the graph's walk file (`gfa-to-tabix
// --walks`) by @jbrowse/graph-walks, converted to the sidecar's shape so the
// panel, headline and map read either.

import {
  ExpansionTooLargeError,
  NO_CALL_STATE,
  RARER_STATE,
  REFERENCE_STATE,
  formsCut,
  structuralForms,
} from '@jbrowse/graph-walks'

import { formDeltas } from './pangenomeSvStates.ts'
import { walkReader } from './pangenomeWalkCut.ts'

import type { ParsedRegion } from './pangenomeRegion.ts'
import type {
  SiteMark as StructuralSiteMark,
  StructuralFormsResult,
} from './pangenomeSvStates.ts'
import type { SiteMark, StructuralForms } from '@jbrowse/graph-walks'

// A sample the walk file carries beside the panel, which no form should hold:
// HPRC's graph walks CHM13 as a haplotype.
const EXCLUDED_SAMPLES = ['CHM13']

// The most abridged steps the page reads in full: LPA's 6.3 M, KIR's 6.0 M and
// AMY1's 4.0 M expand, at 6-8 s of CPU in the worker; MHC class II's 11 M
// would cost 13 s, so its window falls back to the sidecar, as 20 of 19,369
// gene windows do (agent-docs/reference/PANGENOME_PAGES.md).
const STEP_BUDGET = 8_000_000

export class WalkFormsTooLarge extends Error {
  constructor(steps: number) {
    super(`the walks here need ${steps.toLocaleString('en-US')} steps read`)
    this.name = 'WalkFormsTooLarge'
  }
}

function pageMark(m: SiteMark, site: number): StructuralSiteMark {
  const bp = Math.abs(m.delta)
  const at = { site, start: m.refStart, end: m.refEnd, walk: m }
  switch (m.kind) {
    case 'shift':
      return { ...at, kind: 'shifted', bp: m.shiftedBp ?? bp }
    case 'duplication': {
      const [start, end] = m.copied ?? [m.refStart, m.refEnd]
      return { ...at, start, end, kind: 'duplication', bp }
    }
    case 'net':
      return { ...at, kind: 'replacement', bp, gain: m.delta > 0, net: true }
    case 'replacement':
      return { ...at, kind: 'replacement', bp, gain: m.delta > 0 }
    case 'inversion':
      return { ...at, kind: 'inversion', bp: 0 }
    default:
      return { ...at, kind: m.kind, bp }
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
): StructuralFormsResult {
  const order = pageSites(result)
  const index = new Map(order.map((s, i) => [s, i]))
  const forms = result.forms.map(f => {
    const stateMarks = result.informative.flatMap(
      (s, k): StructuralSiteMark[] => {
        const state = f.states[k]
        const site = result.sites[s]!
        const common = {
          site: index.get(s)!,
          start: site.refStart,
          end: site.refEnd,
          bp: 0,
        }
        return state === NO_CALL_STATE
          ? [{ ...common, kind: 'uncalled' }]
          : state === RARER_STATE
            ? [{ ...common, kind: 'rarer' }]
            : []
      },
    )
    const marks = [
      ...f.marks.map(m => pageMark(m, index.get(m.site)!)),
      ...stateMarks,
    ].sort((a, b) => a.start - b.start)
    return {
      members: f.members,
      key: f.key,
      deltas: formDeltas(marks),
      inversions: marks.filter(m => m.kind === 'inversion').length,
      uncalled: stateMarks.filter(m => m.kind === 'uncalled').length,
      rarer: stateMarks.filter(m => m.kind === 'rarer').length,
      bypassed: 0,
      marks,
      onlyShifts: f.onlyShifts,
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
        s.states.length > 0 &&
        s.states.reduce((a, b) =>
          b.carriers.length > a.carriers.length ? b : a,
        ).key !== REFERENCE_STATE,
    ).length,
    minCarriers: result.minCarriers,
  }
}

export async function readWalkForms(
  walksUrl: string,
  region: ParsedRegion,
  signal?: AbortSignal,
) {
  const window = { refName: region.chrom, start: region.start, end: region.end }
  const haplotypes = await formsCut(walkReader(walksUrl), window, {
    signal,
    partial: false,
    stepBudget: STEP_BUDGET,
  }).catch((e: unknown) => {
    throw e instanceof ExpansionTooLargeError
      ? new WalkFormsTooLarge(e.steps)
      : e
  })
  return walkFormsResult(
    structuralForms(haplotypes, {
      window: { start: region.start, end: region.end },
      exclude: EXCLUDED_SAMPLES,
    }),
  )
}
