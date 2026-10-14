// SPDX-License-Identifier: GPL-3.0-or-later
// The one module that imports @jbrowse/bandage-core, which is GPL-3.0: the
// site as deployed is distributed under GPL terms, and its source is public.

import useSWRImmutable from 'swr/immutable'

import { bp } from './pangenomePanels.ts'

import type { ParsedRegion } from './pangenomeRegion.ts'
import type { openGbz } from '@jbrowse/bandage-core'

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

// One open database per page and one cut per window, so another row's
// highlight redraws without fetching.
let opened: ReturnType<typeof openGbz> | undefined

async function laidOut(gbz: string, region: string) {
  const core = await import('@jbrowse/bandage-core')
  const { laidOutGraph } = await import('@jbrowse/bandage-core/figureData')
  const { RemoteFile } = await import('generic-filehandle2')
  const { db, index } =
    gbz === 'hprc' ? core.HPRC_GBZ : { db: gbz, index: undefined }
  opened ??= core.openGbz(
    new RemoteFile(db),
    index ? new RemoteFile(index) : undefined,
  )
  const { text } = await core.cutGbzRegion(await opened, { region })
  return laidOutGraph(text, region, core.parseRegion(region), SPEC)
}

const cuts = new Map<string, ReturnType<typeof laidOut>>()

async function drawGraph(gbz: string, region: string, haplotype?: string) {
  const key = `${gbz} ${region}`
  let cut = cuts.get(key)
  if (!cut) {
    cut = laidOut(gbz, region)
    cuts.set(key, cut)
    cut.catch(() => cuts.delete(key))
  }
  const { graph, layout } = await cut
  const { figureSvg, parseRegion } = await import('@jbrowse/bandage-core')
  const { walkLayers } = await import('@jbrowse/bandage-core/figureData')
  const walk = haplotype
    ? graph.paths?.find(p => p.name.startsWith(`${haplotype}#`))?.name
    : undefined
  const svg = figureSvg(graph, layout, {
    ...SPEC,
    region: parseRegion(region),
    walks: walkLayers(walk ? [walk] : undefined),
  })
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`
}

// A change and the bases around it as Bandage draws them, cut live from the
// graph with every haplotype, so a node's width is how many pass through it,
// with the focused form's haplotype lit.
export default function PangenomeGraph({
  gbz,
  region,
  haplotype,
  what,
}: {
  gbz: string
  region: ParsedRegion
  haplotype?: string
  what: string
}) {
  const loc = `${region.chrom}:${region.start + 1}-${region.end}`
  const { data, error } = useSWRImmutable(
    ['pangenome-graph', gbz, loc, haplotype],
    ([, g, r, h]) => drawGraph(g, r, h),
  )
  return (
    <figure className="ui-graph">
      {data ? (
        <img
          src={data}
          alt={`Graph of ${what}, ${loc}`}
        />
      ) : error ? (
        <p className="ui-error">The graph could not be cut here.</p>
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
