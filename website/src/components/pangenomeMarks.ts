// What a structural form carries at one informative site, in graph-walks'
// vocabulary whether the walks or a callset's sidecar read it, so markTag
// names a change from either without a conversion between them.

import type { Mark } from '@jbrowse/graph-walks'

// A change. `site` indexes the result's `informativeSites`, and `start`/`end`
// are the reference bases the page places it over: a duplication's copied
// stretch, else its site. A walk mark is exact and has a `state`, which tells
// apart same-sized changes at different places in one site; a sidecar's knows
// its size change and not its route, so its `altLength` is the site's length
// plus that change.
export interface ChangeMark extends Mark {
  site: number
  start: number
  end: number
  state?: string
}

// A site where the form says nothing about structure: no call, a state too rare
// to tell a form apart, or another route through a snarl that calls it.
export interface StateMark {
  kind: 'uncalled' | 'rarer' | 'bypassed'
  site: number
  start: number
  end: number
}

export type FormMark = ChangeMark | StateMark

// A change a sidecar states by its size alone
export const sizedChange = (
  kind: ChangeMark['kind'],
  { site, start, end }: Pick<ChangeMark, 'site' | 'start' | 'end'>,
  delta: number,
) => ({
  site,
  start,
  end,
  kind,
  refStart: start,
  refEnd: end,
  altLength: Math.max(0, end - start + delta),
  delta,
})

export const isChange = (m: FormMark) => 'delta' in m

// The bases a change gains or loses, or a shifted pair moves.
export const sizeOf = (m: FormMark) =>
  !isChange(m) || m.kind === 'inversion'
    ? 0
    : m.kind === 'shift'
      ? (m.shiftedBp ?? Math.abs(m.delta))
      : Math.abs(m.delta)

export const gains = (m: FormMark) => isChange(m) && m.delta > 0

// A form's size changes, largest first, with each loss negative
export const formDeltas = (marks: FormMark[]) =>
  marks
    .flatMap(m =>
      isChange(m) && m.kind !== 'shift' && m.kind !== 'inversion'
        ? [m.delta]
        : [],
    )
    .sort((a, b) => Math.abs(b) - Math.abs(a))

// A replacement says only how much shorter or longer a route through its site
// is where it is net, or far wider than its size change: SMN's restored 1.6 Mb
// parent has routes 240 kb shorter, while SMN1 itself is lost on 1–2% of
// haplotypes, and LPA's restored KIV-2 parent reads +78 kb beside the 11 kb
// child row that the same haplotypes also carry.
const DIFFUSE_MIN_SPAN = 10_000

export const diffuse = (m: FormMark) =>
  m.kind === 'net' ||
  (m.kind === 'replacement' &&
    m.end - m.start > Math.max(2 * sizeOf(m), DIFFUSE_MIN_SPAN))

// Where a mark is drawn, in bases. A replacement covers the bases it replaces,
// the whole site. A deletion is its own length centred in its site, which for
// a pure deletion is the site. An insertion or a rare change is a point.
export function drawnSpan(m: FormMark): [number, number] {
  const mid = (m.start + m.end) / 2
  const half = Math.min(sizeOf(m), m.end - m.start) / 2
  return m.kind === 'deletion'
    ? [mid - half, mid + half]
    : m.kind === 'insertion' || m.kind === 'rarer'
      ? [mid, mid]
      : [m.start, m.end]
}
