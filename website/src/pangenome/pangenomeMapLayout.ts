// Where PangenomeMap.tsx draws a window's ruler, genes and marks, as shares of
// the window.

import { drawnSpan } from './pangenomeMarks.ts'

import type { FormMark } from './pangenomeMarks.ts'
import type { ParsedRegion, WindowGene } from './pangenomeRegion.ts'

// A gene narrower than this share of the window shows no name inside it.
export const MIN_LABELLED = 0.08

const STEPS = [
  1000, 2000, 5000, 10_000, 20_000, 50_000, 100_000, 200_000, 500_000,
]

export const tickStep = (span: number) =>
  STEPS.find(s => span / s <= 6) ?? 1_000_000

// x of a base as a share of the window, clamped to it.
export function scale(region: ParsedRegion) {
  const span = region.end - region.start
  return (pos: number) =>
    (Math.min(Math.max(pos, region.start), region.end) - region.start) / span
}

// The ruler's ticks, each a round number of bases, short of the axis label at
// the right end, and how many decimals of a megabase tell them apart.
export function rulerTicks(region: ParsedRegion) {
  const x = scale(region)
  const step = tickStep(region.end - region.start)
  const ticks = []
  for (
    let pos = Math.ceil(region.start / step) * step;
    pos < region.end;
    pos += step
  ) {
    if (x(pos) < 0.9) {
      ticks.push(pos)
    }
  }
  return { ticks, digits: step >= 10_000 ? 2 : 3 }
}

// Genes stacked so overlapping ones do not hide each other: TNXB covers
// CYP21A2, RSRP1 covers RHD. `reach` is what a gene takes up of its row.
export function packRows(
  genes: WindowGene[],
  reach: (g: WindowGene) => [number, number] = g => [g.start, g.end],
) {
  const rows: { end: number; genes: WindowGene[] }[] = []
  for (const g of genes.toSorted((a, b) => reach(a)[0] - reach(b)[0])) {
    const [start, end] = reach(g)
    const row = rows.find(r => r.end < start)
    if (row) {
      row.end = end
      row.genes.push(g)
    } else {
      rows.push({ end, genes: [g] })
    }
  }
  return rows.map(r => r.genes)
}

// A named gene too narrow for its name has it set after it, or before it near
// the window's right edge.
export const NAME_AFTER_UNTIL = 0.85

// About what one letter of a gene's name and its padding cover of the window:
// 6 px and 6 px of a 670 px track.
const NAME_LETTER = 0.011
const NAME_PAD = 0.01

// A gene's reach along its row, as shares of the window, its name beside it
// included: HBA2's name drew over HBA1's, and CATHL1's over the next gene.
export function geneReach(region: ParsedRegion, named: ReadonlySet<string>) {
  const x = scale(region)
  return (g: WindowGene): [number, number] => {
    const from = x(g.start)
    const to = x(g.end)
    const name =
      named.has(g.symbol) && to - from < MIN_LABELLED
        ? g.symbol.length * NAME_LETTER + NAME_PAD
        : 0
    return to < NAME_AFTER_UNTIL ? [from, to + name] : [from - name, to]
  }
}

// A stretch of bases as shares of the window, clamped, and which ends the
// clamp cut.
export function placed(region: ParsedRegion, from: number, to: number) {
  const x = scale(region)
  return {
    left: x(from),
    width: x(to) - x(from),
    clipLeft: from < region.start,
    clipRight: to > region.end,
  }
}

export const placement = (m: FormMark, region: ParsedRegion) =>
  placed(region, ...drawnSpan(m))

export const spanStyle = ({
  left,
  width,
}: {
  left: number
  width: number
}) => ({
  left: `${100 * left}%`,
  width: `${100 * width}%`,
})
