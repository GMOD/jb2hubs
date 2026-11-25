// SPDX-License-Identifier: GPL-3.0-or-later
// Starts the layout worker, the one module that imports @jbrowse/bandage-core,
// which is GPL-3.0: the site as deployed is distributed under GPL terms, and
// its source is public.

import '../styles/pangenome.css'

import { LIVE_QUERY, useSWRImmutable } from '../lib/swr.ts'
import { layoutClient } from './pangenomeGraphLayout.ts'
import { bp, steps } from './pangenomeProse.ts'
import { Superseded } from './pangenomeWorkerClient.ts'

import type { GraphRequest } from './pangenomeGraphLayout.ts'
import type { ParsedRegion } from './pangenomeRegion.ts'
import type { AbridgedWalk } from './pangenomeWalkCut.ts'

// The page gives up on a stalled read or layout after this long.
const DEADLINE_MS = 30_000

const draw = layoutClient(
  () =>
    new Worker(new URL('./pangenomeGraphLayout.worker.ts', import.meta.url), {
      type: 'module',
    }),
)

const blockLabel = (w: AbridgedWalk) =>
  `${w.haplotype}: ${steps(w.steps)} steps, ${bp(w.bp)} not loaded`

// A drawing of the window, kept on screen while the next one draws; `failed`
// is an error the page shows, not one a newer request superseded.
export function useGraphDrawing(request: GraphRequest | undefined) {
  const { data, error, isLoading } = useSWRImmutable(
    request ? ['pangenome-graph', request] : null,
    ([, r]) => draw(r, AbortSignal.timeout(DEADLINE_MS)),
    { ...LIVE_QUERY, keepPreviousData: true },
  )
  const failed = error && !isLoading && !(error instanceof Superseded)
  return { data, error, isLoading, failed }
}

// The window as Bandage draws it once every difference under 1 kb is folded
// into the reference: cut live from the graph's walks with every haplotype,
// the ones that take one route drawn as one thread as wide as their count,
// the lit row's thread highlighted. Where the whole window is too large or
// too tangled, the lit row's own change and its flanks are drawn instead, and
// the caption names it. A walk the file abridged draws a placeholder for each
// of its runs off the reference: the lit haplotype's is read in full, and each
// other's on a click. Until a row is clicked it says nothing while it loads or
// if it fails.
export default function PangenomeGraph({
  region,
  haplotype,
  lit,
  drawing,
  what,
  asked,
  onExpand,
}: {
  region: ParsedRegion
  haplotype: string
  // the rows lit, the reference's first
  lit: string[]
  drawing: ReturnType<typeof useGraphDrawing>
  what: string
  asked: boolean
  onExpand: (haplotype: string) => void
}) {
  const { data, error, isLoading, failed } = drawing
  const drawn = data?.region ?? region
  const loc = `${drawn.chrom}:${drawn.start + 1}-${drawn.end}`
  const narrowed =
    data !== undefined &&
    (data.region.start !== region.start || data.region.end !== region.end)
  return !asked && (failed || !data) ? null : (
    <figure
      className="ui-graph"
      aria-busy={isLoading}
    >
      {failed ? (
        <p className="ui-error">
          {error instanceof DOMException && error.name === 'TimeoutError'
            ? `The graph gave no answer in ${DEADLINE_MS / 1000} s.`
            : error instanceof Error && 'regionTooLarge' in error
              ? 'This stretch of the graph is too large to draw.'
              : 'The graph could not be cut here.'}
        </p>
      ) : data ? (
        <img
          src={data.image}
          alt={`Graph of ${narrowed ? `${what}, ` : ''}${loc}, differences under 1 kb left out: a lit thread is as wide as its share of the haplotypes; lit: ${lit.join(', ')}`}
        />
      ) : (
        <p className="ui-hint">
          Cutting {bp(region.end - region.start)} of the graph…
        </p>
      )}
      {data && !failed && (isLoading || narrowed) && (
        <figcaption className="ui-hint">
          {isLoading ? `Redrawing with ${haplotype} lit…` : `${what}, ${loc}`}
        </figcaption>
      )}
      {data && data.abridged.length > 0 && (
        <details className="ui-fold">
          <summary>
            {data.abridged.length === 1
              ? '1 haplotype is abridged here, drawn without the nodes of its runs off the reference'
              : `${data.abridged.length} haplotypes are abridged here, drawn without the nodes of their runs off the reference`}
          </summary>
          <p className="ui-hint">Click one to read its walk in full.</p>
          <p className="ui-actions">
            {data.abridged.map(w => (
              <button
                key={w.haplotype}
                type="button"
                className="ui-chip-btn"
                title="Read this walk in full"
                onClick={() => {
                  onExpand(w.haplotype)
                }}
              >
                {blockLabel(w)}
              </button>
            ))}
          </p>
        </details>
      )}
    </figure>
  )
}
