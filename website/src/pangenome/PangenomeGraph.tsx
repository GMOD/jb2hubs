// SPDX-License-Identifier: GPL-3.0-or-later
// Starts the layout worker, the one module that imports @jbrowse/bandage-core,
// which is GPL-3.0: the site as deployed is distributed under GPL terms, and
// its source is public.

import '../styles/pangenome.css'

import { useState } from 'react'

import { LIVE_QUERY, useSWRImmutable } from '../lib/swr.ts'
import { layoutClient } from './pangenomeGraphLayout.ts'
import { bp, steps } from './pangenomeProse.ts'
import { Superseded } from './pangenomeWorkerClient.ts'

import type { ParsedRegion, WindowGene } from './pangenomeRegion.ts'
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

// The window as Bandage draws it once every difference under 1 kb is folded
// into the reference: cut live from the graph's walks with every haplotype,
// the ones that take one route drawn as one thread as wide as their count,
// the lit row's thread highlighted. Where the whole window is too large or
// too tangled, the lit row's own change and its flanks are drawn instead, and
// the caption names it. A walk the file abridged draws a placeholder for each
// of its runs off the reference: the lit haplotype's is read in full, and each
// other's on a click. The region box keys it by window, so a new window starts
// with nothing expanded, and the drawing kept through a re-layout is always
// this window's. Until a row is clicked it says nothing while it loads or if
// it fails.
export default function PangenomeGraph({
  walksUrl,
  region,
  change,
  haplotype,
  lit,
  genes,
  what,
  asked,
}: {
  walksUrl: string
  region: ParsedRegion
  // the lit row's own change with its flanks, drawn where the window cannot be
  change?: ParsedRegion
  haplotype: string
  // the rows lit, the reference's first
  lit: string[]
  genes: WindowGene[]
  what: string
  asked: boolean
}) {
  const [expand, setExpand] = useState<string[]>([])
  const regions = [region, ...(change ? [change] : [])]
  const { data, error, isLoading } = useSWRImmutable(
    [
      'pangenome-graph',
      walksUrl,
      regions.map(r => `${r.chrom}:${r.start}-${r.end}`).join(' '),
      haplotype,
      lit.join(' '),
      expand.join(' '),
    ],
    ([, w, , h]) =>
      draw(
        { walksUrl: w, regions, haplotype: h, lit, expand, genes },
        AbortSignal.timeout(DEADLINE_MS),
      ),
    { ...LIVE_QUERY, keepPreviousData: true },
  )
  const drawn = data?.region ?? region
  const loc = `${drawn.chrom}:${drawn.start + 1}-${drawn.end}`
  const narrowed =
    data !== undefined &&
    (data.region.start !== region.start || data.region.end !== region.end)
  const failed = error && !isLoading && !(error instanceof Superseded)
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
                  setExpand([...expand, w.haplotype])
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
