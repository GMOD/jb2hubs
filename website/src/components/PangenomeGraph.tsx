// SPDX-License-Identifier: GPL-3.0-or-later
// The one module that imports @jbrowse/bandage-core, which is GPL-3.0: the
// site as deployed is distributed under GPL terms, and its source is public.

import useSWRImmutable from 'swr/immutable'

import { LIVE_QUERY } from '../lib/swr.ts'
import { bp } from './pangenomePanels.ts'

import type { ParsedRegion } from './pangenomeRegion.ts'

const SPEC = {
  layout: 'force',
  // Plain JS: the reference drawn straight, an allele as a lens and a deletion
  // as an arch. FMMM is 434 KB of wasm and draws a tangle at this size.
  engine: 'stress',
  nodeWidth: 'depth',
  colorScheme: 'grey',
  width: 900,
  height: 200,
} as const

// A cut reads a few hundred KB; a stalled read says so instead of cutting
// forever.
const DEADLINE_MS = 30_000

const figureRegion = ({ chrom, start, end }: ParsedRegion) => ({
  refName: chrom,
  start,
  end,
})

async function laidOut(walksUrl: string, region: ParsedRegion) {
  const [{ cutWalks, walkReader }, { graphTablesGFA }, { laidOutGraph }] =
    await Promise.all([
      import('./pangenomeWalkCut.ts'),
      import('@jbrowse/bandage-core/gfa/graphTables'),
      import('@jbrowse/bandage-core/figureData'),
    ])
  const tables = await cutWalks(
    walkReader(walksUrl),
    region,
    AbortSignal.timeout(DEADLINE_MS),
  )
  return laidOutGraph(
    graphTablesGFA(tables),
    `${region.chrom}:${region.start}-${region.end}`,
    figureRegion(region),
    SPEC,
  )
}

// One cut per graph and window, so another row's highlight redraws without
// fetching. A failed cut is dropped, so the next click cuts again.
const cuts = new Map<string, ReturnType<typeof laidOut>>()

function cutOnce(walksUrl: string, region: ParsedRegion) {
  const key = `${walksUrl} ${region.chrom}:${region.start}-${region.end}`
  let cut = cuts.get(key)
  if (!cut) {
    cut = laidOut(walksUrl, region)
    cuts.set(key, cut)
    cut.catch(() => cuts.delete(key))
  }
  return cut
}

async function drawGraph(
  walksUrl: string,
  region: ParsedRegion,
  haplotype?: string,
) {
  const { graph, layout } = await cutOnce(walksUrl, region)
  const [{ figureSvg }, { walkLayers }] = await Promise.all([
    import('@jbrowse/bandage-core/figure'),
    import('@jbrowse/bandage-core/figureData'),
  ])
  const walk = haplotype
    ? graph.paths?.find(p => p.name.startsWith(`${haplotype}#`))?.name
    : undefined
  const svg = figureSvg(graph, layout, {
    ...SPEC,
    region: figureRegion(region),
    walks: walkLayers(walk ? [walk] : undefined),
  })
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`
}

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
    ([, w, chrom, start, end, h]) => drawGraph(w, { chrom, start, end }, h),
    LIVE_QUERY,
  )
  return (
    <figure className="ui-graph">
      {data ? (
        <img
          src={data}
          alt={`Graph of ${what}, ${loc}`}
        />
      ) : error ? (
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
