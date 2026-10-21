// SPDX-License-Identifier: GPL-3.0-or-later
// Starts the layout worker, the one module that imports @jbrowse/bandage-core,
// which is GPL-3.0: the site as deployed is distributed under GPL terms, and
// its source is public.

import { useState } from 'react'

import useSWRImmutable from 'swr/immutable'

import { LIVE_QUERY } from '../lib/swr.ts'
import { Superseded, layoutClient } from './pangenomeGraphLayout.ts'
import { bp } from './pangenomePanels.ts'

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

const steps = (n: number) =>
  n >= 1000 ? `${Number((n / 1000).toPrecision(2))} k` : `${n}`

const blockLabel = (w: AbridgedWalk) =>
  `${w.haplotype}: ${steps(w.steps)} steps, ${bp(w.bp)} off reference`

// A change and the bases around it as Bandage draws them, cut live from the
// graph's walks with every haplotype, so a node's width is how many pass
// through it, with the focused form's haplotype lit. A walk the file abridged
// counts only where it leaves and rejoins the reference: the focused
// haplotype's is read in full, and each other's on a click.
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
  const [loaded, setLoaded] = useState({ loc, haplotypes: [] as string[] })
  const expand = loaded.loc === loc ? loaded.haplotypes : []
  const { data, error } = useSWRImmutable(
    [
      'pangenome-graph',
      walksUrl,
      region.chrom,
      region.start,
      region.end,
      haplotype,
      expand.join(' '),
    ],
    ([, w, chrom, start, end, h]) =>
      draw(
        { walksUrl: w, region: { chrom, start, end }, haplotype: h, expand },
        AbortSignal.timeout(DEADLINE_MS),
      ),
    LIVE_QUERY,
  )
  return (
    <figure className="ui-graph">
      {data ? (
        <img
          src={data.image}
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
      {data && data.abridged.length > 0 && (
        <details className="ui-more">
          <summary>
            {data.abridged.length === 1
              ? '1 haplotype is abridged here and counts'
              : `${data.abridged.length} haplotypes are abridged here and count`}{' '}
            only where the walk leaves and rejoins the reference
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
                  setLoaded({ loc, haplotypes: [...expand, w.haplotype] })
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
