import type { AnnotationInfo } from './accessionData.ts'

type Busco = NonNullable<AnnotationInfo['busco']>
type GeneCounts = NonNullable<
  NonNullable<AnnotationInfo['stats']>['gene_counts']
>

export interface Segment {
  key: string
  label: string
  value: number
  color: string
}

export interface PlacedSegment extends Segment {
  x: number
  width: number
}

// Contig N50 runs from under 5 kb to over 100 Mb across the hosted assemblies,
// so the axis is log-scaled over six decades and clamps what falls outside.
export const AXIS_MIN_BP = 1e3
export const AXIS_MAX_BP = 1e9
export const AXIS_TICKS = [
  { bp: 1e3, label: '1 kb' },
  { bp: 1e6, label: '1 Mb' },
  { bp: 1e9, label: '1 Gb' },
]

const logMin = Math.log10(AXIS_MIN_BP)
const logSpan = Math.log10(AXIS_MAX_BP) - logMin

export function axisFraction(bp: number) {
  const f = (Math.log10(Math.max(bp, 1)) - logMin) / logSpan
  return Math.min(1, Math.max(0, f))
}

export function formatBp(bp: number) {
  const units = [
    [1e9, 'Gb'],
    [1e6, 'Mb'],
    [1e3, 'kb'],
  ] as const
  for (const [scale, unit] of units) {
    if (bp >= scale) {
      const v = bp / scale
      return `${v >= 100 ? v.toFixed(0) : v.toPrecision(3)} ${unit}`
    }
  }
  return `${bp} bp`
}

export function formatCount(n: number) {
  return n.toLocaleString('en-US')
}

export function formatPercent(fraction: number) {
  return `${(fraction * 100).toFixed(1)}%`
}

export function n50Histogram(values: Iterable<number>, bins = 60) {
  const counts = Array.from({ length: bins }, () => 0)
  for (const v of values) {
    const bin = Math.min(bins - 1, Math.floor(axisFraction(v) * bins))
    counts[bin] = counts[bin]! + 1
  }
  return counts
}

// The share of `sorted` (ascending) strictly below `value`
export function shareBelow(sorted: readonly number[], value: number) {
  let lo = 0
  let hi = sorted.length
  while (lo < hi) {
    const mid = (lo + hi) >>> 1
    if (sorted[mid]! < value) {
      lo = mid + 1
    } else {
      hi = mid
    }
  }
  return sorted.length ? lo / sorted.length : undefined
}

// BUSCO's own plot colours, from ezlab/busco src/busco/BuscoPlot.py, so the bar
// reads as the figure every assembly paper prints.
export function buscoSegments(busco: Busco | undefined) {
  if (busco?.complete === undefined) {
    return undefined
  }
  const parts: [keyof Busco, string, string][] = [
    ['single_copy', 'single-copy', '#56B4E9'],
    ['duplicated', 'duplicated', '#3492C7'],
    ['fragmented', 'fragmented', '#F0E442'],
    ['missing', 'missing', '#F04442'],
  ]
  const segments = parts.flatMap(([key, label, color]) => {
    const value = busco[key]
    return typeof value === 'number' ? [{ key, label, value, color }] : []
  })
  return segments.length ? segments : undefined
}

// NCBI leaves out a kind the annotation has none of, and a third of RefSeq
// annotations lack non-coding or pseudogene counts, so only the kinds present
// are drawn.
export function geneSegments(counts: GeneCounts | undefined) {
  const parts: [keyof GeneCounts, string, string][] = [
    ['protein_coding', 'protein-coding', '#2a78d6'],
    ['non_coding', 'non-coding', '#eb6834'],
    ['pseudogene', 'pseudogenes', '#1baf7a'],
    ['other', 'other', '#b4b4b0'],
  ]
  const segments = parts.flatMap(([key, label, color]) => {
    const value = counts?.[key]
    return value ? [{ key, label, value, color }] : []
  })
  return segments.length ? segments : undefined
}

// Lays segments end to end across `width` in proportion to their values, with
// `gap` of surface between neighbours
export function stack(segments: Segment[], width: number, gap = 2) {
  const total = segments.reduce((sum, s) => sum + s.value, 0)
  const drawn = segments.filter(s => s.value > 0)
  const usable = width - gap * Math.max(0, drawn.length - 1)
  let x = 0
  return drawn.map(s => {
    const placed = { ...s, x, width: (s.value / total) * usable }
    x += placed.width + gap
    return placed
  })
}
