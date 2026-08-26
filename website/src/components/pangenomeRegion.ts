// Parsing for the HPRC page's "draw any region as a graph" form.

import { MAX_DETAIL_WINDOW_BP } from './pangenomeLoci.ts'

// The GraphGenomeView refuses a region wider than its `maxRegionBp` (5 Mb by
// default) outright, so past this the launch would open on an error rather than
// on a thread. The catalog's `MAX_DETAIL_WINDOW_BP` is the readable ceiling.
export const MAX_GRAPH_REGION_BP = 5_000_000

export type ParsedRegion =
  | { ok: true; chrom: string; start: number; end: number; wide: boolean }
  | { ok: false; error: string }

// Accepts `chr6:32,510,000-32,600,000`, with or without commas, and the `..`
// separator UCSC also takes. Coordinates are 1-based inclusive as typed into a
// browser, and come back 0-based half-open as the view wants.
export function parseRegion(input: string): ParsedRegion {
  const m =
    /^\s*([A-Za-z0-9_.]+)\s*:\s*([\d,]+)\s*(?:-|\.\.)\s*([\d,]+)\s*$/.exec(
      input,
    )
  if (!m) {
    return {
      ok: false,
      error: 'Expected chrom:start-end, e.g. chr6:32,510,000-32,600,000',
    }
  }
  const chrom = m[1]!
  const start = Number(m[2]!.replaceAll(',', '')) - 1
  const end = Number(m[3]!.replaceAll(',', ''))
  if (!(start >= 0) || !(end > start)) {
    return { ok: false, error: 'End must be after start' }
  }
  if (end - start > MAX_GRAPH_REGION_BP) {
    return {
      ok: false,
      error: `The graph view draws at most ${MAX_GRAPH_REGION_BP / 1_000_000} Mb at once`,
    }
  }
  return {
    ok: true,
    chrom,
    start,
    end,
    wide: end - start > MAX_DETAIL_WINDOW_BP,
  }
}

export function formatRegion(chrom: string, start: number, end: number) {
  return `${chrom}:${(start + 1).toLocaleString('en-US')}-${end.toLocaleString('en-US')}`
}
