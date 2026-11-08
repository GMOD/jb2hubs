// A window's structural forms read off the graph's walk file (`gfa-to-tabix
// --walks`) by @jbrowse/graph-walks, in the sidecar reader's result with
// graph-walks' own marks, so the panel, headline and map read either.

import {
  DepartureReadError,
  ExpansionTooLargeError,
  NO_CALL_STATE,
  OTHER_STATE,
  RARER_STATE,
  REFERENCE_STATE,
  RegionTooLargeError,
  formsCut,
  structuralForms,
} from '@jbrowse/graph-walks'

import { formDeltas } from './pangenomeMarks.ts'
import { walkReader } from './pangenomeWalkCut.ts'

import type { ChangeMark, FormMark } from './pangenomeMarks.ts'
import type { ParsedRegion } from './pangenomeRegion.ts'
import type { StructuralFormsResult } from './pangenomeSvStates.ts'
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
  constructor(reason: string) {
    super(reason)
    this.name = 'WalkFormsTooLarge'
  }
}

// A read past one of graph-walks' budgets: the abridged walks' steps, the
// window's bytes, or its departure records' bytes
export function walkFormsError(e: unknown) {
  return e instanceof ExpansionTooLargeError
    ? new WalkFormsTooLarge(
        `the walks here need ${e.steps.toLocaleString('en-US')} steps read`,
      )
    : e instanceof RegionTooLargeError || e instanceof DepartureReadError
      ? new WalkFormsTooLarge(e.message)
      : e
}

// A walk mark as the page numbers its site, placed over the stretch a
// duplication copies.
function pageMark(m: SiteMark, site: number): ChangeMark {
  const [start, end] =
    m.kind === 'duplication' && m.copied ? m.copied : [m.refStart, m.refEnd]
  return { ...m, site, start, end }
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
    if (f.key === OTHER_STATE) {
      return {
        members: f.members,
        key: f.key,
        deltas: [],
        inversions: 0,
        uncalled: 0,
        rarer: 0,
        bypassed: 0,
        marks: [],
        other: true as const,
      }
    }
    const stateMarks = result.informative.flatMap((s, k): FormMark[] => {
      const state = f.states[k]
      const site = result.sites[s]!
      const common = {
        site: index.get(s)!,
        start: site.refStart,
        end: site.refEnd,
      }
      return state === NO_CALL_STATE
        ? [{ ...common, kind: 'uncalled' }]
        : state === RARER_STATE
          ? [{ ...common, kind: 'rarer' }]
          : []
    })
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
    throw walkFormsError(e)
  })
  return walkFormsResult(
    structuralForms(haplotypes, {
      window: { start: region.start, end: region.end },
      exclude: EXCLUDED_SAMPLES,
    }),
  )
}
