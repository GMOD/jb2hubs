// SPDX-License-Identifier: GPL-3.0-or-later
// The one module that imports @jbrowse/bandage-core, which is GPL-3.0, and
// only PangenomeGraph.tsx starts it: the site as deployed is distributed under
// GPL terms, and its source is public.

import { figureSvg } from '@jbrowse/bandage-core/figure'
import { laidOutGraph, walkLayers } from '@jbrowse/bandage-core/figureData'
import { graphTablesGFA } from '@jbrowse/bandage-core/gfa/graphTables'

import { replyError, windowKey } from './pangenomeGraphLayout.ts'
import { cutWalks, walkReader } from './pangenomeWalkCut.ts'

import type { GraphReply, GraphRequest } from './pangenomeGraphLayout.ts'
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

const figureRegion = ({ chrom, start, end }: ParsedRegion) => ({
  refName: chrom,
  start,
  end,
})

async function laidOut(walksUrl: string, region: ParsedRegion) {
  const tables = await cutWalks(walkReader(walksUrl), region)
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
  const key = windowKey(walksUrl, region)
  let cut = cuts.get(key)
  if (!cut) {
    cut = laidOut(walksUrl, region)
    cuts.set(key, cut)
    cut.catch(() => cuts.delete(key))
  }
  return cut
}

async function drawGraph({ walksUrl, region, haplotype }: GraphRequest) {
  const { graph, layout } = await cutOnce(walksUrl, region)
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

self.onmessage = ({ data }: MessageEvent<GraphRequest>) => {
  void drawGraph(data)
    .then(
      (image): GraphReply => ({ id: data.id, image }),
      (error: unknown): GraphReply => ({
        id: data.id,
        error: replyError(error),
      }),
    )
    .then(reply => {
      self.postMessage(reply)
    })
}
