// Parsing for the portal's "draw any region as a graph" form.

import { MAX_DETAIL_WINDOW_BP } from './pangenomeLoci.ts'

export type ParsedRegion =
  | { ok: true; chrom: string; start: number; end: number; coarse: boolean }
  | { ok: false; error: string }

// Accepts `chr6:32,510,000-32,600,000`, with or without commas, and the `..`
// separator UCSC also takes. Coordinates are 1-based inclusive as typed into a
// browser, and come back 0-based half-open as the view wants.
//
// No upper bound. There used to be one — the GraphGenomeView refuses a cut
// wider than its `maxRegionBp` (5 Mb by default) — but a wide region is now
// drawn from the coarse tier, and that launch raises `maxRegionBp` to the span
// (see `graphRegionUrl`). `coarse` says which side of MAX_DETAIL_WINDOW_BP the
// span falls on, so the form can name what it will draw; whether a tier exists
// to draw it is the dataset's question, not the parser's.
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
  return start >= 0 && end > start
    ? {
        ok: true,
        chrom,
        start,
        end,
        coarse: end - start > MAX_DETAIL_WINDOW_BP,
      }
    : { ok: false, error: 'End must be after start' }
}

export function formatRegion(chrom: string, start: number, end: number) {
  return `${chrom}:${(start + 1).toLocaleString('en-US')}-${end.toLocaleString('en-US')}`
}
