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
