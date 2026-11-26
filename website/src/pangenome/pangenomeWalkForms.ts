// A window's structural forms read off the graph's walk file (`gfa-to-tabix
// --walks`) by @gmod/gfa-tabix, in the sidecar reader's result with
// gfa-tabix's own marks, so the panel, headline and map read either.

import {
  DepartureReadError,
  MissingSequenceError,
  NO_CALL_STATE,
  OTHER_STATE,
  RARER_STATE,
  REFERENCE_STATE,
  RegionTooLargeError,
  stateKey,
  structuralForms,
} from '@gmod/gfa-tabix'

import { formDeltas } from './pangenomeMarks.ts'
import { EXCLUDED_SAMPLES } from './pangenomeSvStates.ts'
import { walkFile } from './pangenomeWalkCut.ts'

import type { ChangeMark, FormMark } from './pangenomeMarks.ts'
import type { ParsedRegion } from './pangenomeRegion.ts'
import type { StructuralFormsResult } from './pangenomeSvStates.ts'
import type { SiteMark, StructuralForms } from '@gmod/gfa-tabix'

export class WalkFormsTooLarge extends Error {
  constructor(reason: string) {
    super(reason)
    this.name = 'WalkFormsTooLarge'
  }
}

// A read past one of gfa-tabix's budgets: the window's steps or bytes, or
// its departure records' bytes
export function walkFormsError(e: unknown) {
  return e instanceof RegionTooLargeError || e instanceof DepartureReadError
    ? new WalkFormsTooLarge(e.message)
    : e
}

const LOPSIDED_SIDE_BP = 50
const LOPSIDED_RATIO = 0.05

// A replacement with one side under 50 bp and a twentieth of the other is an
// insertion or a deletion to the page, as it was to graph-walks until 9.0.0,
// which names it by both sides: PGA's commonest row split in two, one of them
// "1 bp → 18.7 kb", and GSTT1's deletion read "37.2 kb → 6 bp".
const pageKind = (m: SiteMark) => {
  const least = Math.min(m.refLength, m.altLength)
  const most = Math.max(m.refLength, m.altLength)
  return m.kind === 'replacement' &&
    least < LOPSIDED_SIDE_BP &&
    least < LOPSIDED_RATIO * most
    ? m.delta > 0
      ? 'insertion'
      : 'deletion'
    : m.kind
}

// A walk mark as the page numbers its site, placed over the stretch a
// duplication copies.
function pageMark(m: SiteMark, site: number): ChangeMark {
  const [start, end] =
    m.kind === 'duplication' && m.copied ? m.copied : [m.refStart, m.refEnd]
  const kind = pageKind(m)
  // a mark the page renames takes its new kind's state, so the insertion that
  // replaces 1 bp at a site is one change with the one that replaces none
  return {
    ...m,
    kind,
    state: kind === m.kind ? m.state : stateKey({ ...m, kind }),
    site,
    start,
    end,
  }
}

const SHIFT_MIN_BP = 1000
const SHIFT_TOLERANCE = 0.1

// A deletion of 1 kb or more and an insertion or duplication within 10% of
// its size, no further from it than twice that size, are the reference's
// length with the sequence placed elsewhere: at AMY1, 191 haplotypes pair a
// 94,204 bp deletion with a 94,142 bp insertion 18 kb away. graph-walks paired
// them until 9.0.0, by this rule, and the map's "realigned" rows are these.
export function pairWalkShifts(marks: ChangeMark[]) {
  const used = new Set<ChangeMark>()
  const deletions = marks
    .filter(m => m.kind === 'deletion' && -m.delta >= SHIFT_MIN_BP)
    .toSorted((a, b) => a.delta - b.delta)
  const shifts = deletions.flatMap((d): ChangeMark[] => {
    const size = -d.delta
    const gain = marks.find(
      m =>
        !used.has(m) &&
        (m.kind === 'insertion' || m.kind === 'duplication') &&
        Math.abs(m.delta - size) <= SHIFT_TOLERANCE * Math.max(m.delta, size) &&
        Math.max(m.refStart - d.refEnd, d.refStart - m.refEnd) <= 2 * size,
    )
    if (gain) {
      used.add(gain)
      used.add(d)
    }
    const refStart = gain ? Math.min(d.refStart, gain.refStart) : 0
    const refEnd = gain ? Math.max(d.refEnd, gain.refEnd) : 0
    const delta = gain ? d.delta + gain.delta : 0
    return gain
      ? [
          {
            kind: 'shift',
            site: d.site,
            state: `s${d.state ?? ''}`,
            start: refStart,
            end: refEnd,
            refStart,
            refEnd,
            refLength: refEnd - refStart,
            altLength: refEnd - refStart + delta,
            delta,
            shiftedBp: size,
          },
        ]
      : []
  })
  return [...marks.filter(m => !used.has(m)), ...shifts]
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
  return [...named].toSorted(
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
      ...pairWalkShifts(f.marks.map(m => pageMark(m, index.get(m.site)!))),
      ...stateMarks,
    ].toSorted((a, b) => a.start - b.start)
    return {
      members: f.members,
      key: f.key,
      deltas: formDeltas(marks),
      inversions: marks.filter(m => m.kind === 'inversion').length,
      uncalled: stateMarks.filter(m => m.kind === 'uncalled').length,
      rarer: stateMarks.filter(m => m.kind === 'rarer').length,
      bypassed: 0,
      marks,
      onlyShifts:
        stateMarks.length === 0 &&
        marks.length > 0 &&
        marks.every(m => m.kind === 'shift'),
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
  const walks = walkFile(walksUrl)
  const haplotypes = await walks
    .getFormsForRange(region.chrom, region.start, region.end, { signal })
    .catch(async (e: unknown) => {
      if (e instanceof MissingSequenceError) {
        const header = await walks.getHeader({ signal })
        return header.haplotypes.map(haplotype => ({
          haplotype,
          covered: [],
          departures: [],
        }))
      } else {
        throw walkFormsError(e)
      }
    })
  return walkFormsResult(
    structuralForms(haplotypes, {
      window: { start: region.start, end: region.end },
      exclude: EXCLUDED_SAMPLES,
    }),
  )
}
