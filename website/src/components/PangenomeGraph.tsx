// SPDX-License-Identifier: GPL-3.0-or-later
// Starts the layout worker, the one module that imports @jbrowse/bandage-core,
// which is GPL-3.0: the site as deployed is distributed under GPL terms, and
// its source is public.

import useSWRImmutable from 'swr/immutable'

import { LIVE_QUERY } from '../lib/swr.ts'
import { Superseded, layoutClient } from './pangenomeGraphLayout.ts'
import { bp } from './pangenomePanels.ts'

import type { ParsedRegion } from './pangenomeRegion.ts'

// A stalled read or layout says so instead of drawing forever.
const DEADLINE_MS = 30_000

const draw = layoutClient(
  () =>
    new Worker(new URL('./pangenomeGraphLayout.worker.ts', import.meta.url), {
      type: 'module',
    }),
)

// A change and the bases around it as Bandage draws them, cut live from the
// graph's walks with every haplotype, so a node's width is how many pass
// through it, with the focused form's haplotype lit.
export default function PangenomeGraph({
  walksUrl,
  region,
  haplotype,
  what,
}: {
  walksUrl: string
  region: ParsedRegion
  haplotype?: string
  what: string
}) {
  const loc = `${region.chrom}:${region.start + 1}-${region.end}`
  const { data, error } = useSWRImmutable(
    [
      'pangenome-graph',
      walksUrl,
      region.chrom,
      region.start,
      region.end,
      haplotype,
    ],
    ([, w, chrom, start, end, h]) =>
      draw(w, { chrom, start, end }, h, AbortSignal.timeout(DEADLINE_MS)),
    LIVE_QUERY,
  )
  return (
    <figure className="ui-graph">
      {data ? (
        <img
          src={data}
          alt={`Graph of ${what}, ${loc}`}
        />
      ) : error && !(error instanceof Superseded) ? (
        <p className="ui-error">
          {error instanceof DOMException && error.name === 'TimeoutError'
            ? `The graph gave no answer in ${DEADLINE_MS / 1000} s.`
            : error instanceof Error && 'regionTooLarge' in error
              ? 'This stretch of the graph is too large to draw.'
              : 'The graph could not be cut here.'}
        </p>
      ) : (
        <p className="ui-hint">
          Cutting {bp(region.end - region.start)} of the graph…
        </p>
      )}
      <figcaption className="ui-hint">
        {what}, as the graph has it: width is how many haplotypes pass through
        {haplotype ? `, ${haplotype} highlighted` : ''}.
      </figcaption>
    </figure>
  )
}
