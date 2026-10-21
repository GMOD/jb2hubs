// SPDX-License-Identifier: GPL-3.0-or-later
// The one module that imports @jbrowse/bandage-core, which is GPL-3.0, and
// only PangenomeGraph.tsx starts it: the site as deployed is distributed under
// GPL terms, and its source is public.

import { figureSvg } from '@jbrowse/bandage-core/figure'
import { walkLayers } from '@jbrowse/bandage-core/figureData'
import { layoutEngine } from '@jbrowse/bandage-core/layoutEngines'
import {
  engineSettingsOf,
  forceLayout,
  loadGraph,
} from '@jbrowse/bandage-core/pipeline'

import { replyError, windowKey } from './pangenomeGraphLayout.ts'
import { abridgedWalks, cutWalks, walkReader } from './pangenomeWalkCut.ts'

import type { Drawn, GraphReply, GraphRequest } from './pangenomeGraphLayout.ts'
import type { ParsedRegion } from './pangenomeRegion.ts'

const SPEC = {
  // Plain JS: the reference drawn straight, an allele as a lens and a deletion
  // as an arch. FMMM is 434 KB of wasm and draws a tangle at this size.
  engine: 'stress',
  nodeWidth: 'depth',
  colorScheme: 'grey',
  width: 900,
  // room for a loop to draw across the width; a flat cut still draws 160 px
  height: 400,
} as const

const figureRegion = ({ chrom, start, end }: ParsedRegion) => ({
  refName: chrom,
  start,
  end,
})

// The latest cuts and layouts, each of a window with some haplotypes read in
// full, so another row's highlight redraws without fetching. The worker drops
// a failed one, so the next click tries again.
const KEPT = 8

function memo<T>() {
  const kept = new Map<string, Promise<T>>()
  return (key: string, make: () => Promise<T>) => {
    let p = kept.get(key)
    if (!p) {
      p = make()
      p.catch(() => kept.delete(key))
    }
    kept.delete(key)
    kept.set(key, p)
    if (kept.size > KEPT) {
      kept.delete(kept.keys().next().value!)
    }
    return p
  }
}

const cuts = memo<Awaited<ReturnType<typeof cutWalks>>>()
const layouts = memo<Awaited<ReturnType<typeof layOut>>>()

const cutKey = (walksUrl: string, region: ParsedRegion, expand: string[]) =>
  `${windowKey(walksUrl, region)} ${expand.join(' ')}`

const cutOf = (walksUrl: string, region: ParsedRegion, expand: string[]) =>
  cuts(cutKey(walksUrl, region, expand), () =>
    cutWalks(walkReader(walksUrl), region, expand),
  )

async function layOut(
  walksUrl: string,
  region: ParsedRegion,
  expand: string[],
) {
  const tables = await cutOf(walksUrl, region, expand)
  const graph = loadGraph(
    tables,
    `${region.chrom}:${region.start}-${region.end}`,
  )
  const { result } = await forceLayout(
    graph,
    engineSettingsOf(SPEC),
    layoutEngine,
  )
  return { graph, layout: result, abridged: abridgedWalks(tables) }
}

async function drawGraph({
  walksUrl,
  region,
  haplotype,
  expand,
}: GraphRequest): Promise<Drawn> {
  const shown = abridgedWalks(await cutOf(walksUrl, region, []))
  const full = [...new Set(haplotype ? [haplotype, ...expand] : expand)]
    .filter(h => shown.some(w => w.haplotype === h))
    .sort()
  const { graph, layout, abridged } = await layouts(
    cutKey(walksUrl, region, full),
    () => layOut(walksUrl, region, full),
  )
  const walk = haplotype
    ? graph.paths?.find(p => p.name.startsWith(`${haplotype}#`))?.name
    : undefined
  const svg = figureSvg(graph, layout, {
    ...SPEC,
    region: figureRegion(region),
    walks: walkLayers(walk ? [walk] : undefined),
  })
  return {
    image: `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`,
    abridged,
  }
}

self.onmessage = ({ data }: MessageEvent<GraphRequest>) => {
  void drawGraph(data)
    .then(
      (drawn): GraphReply => ({ id: data.id, ...drawn }),
      (error: unknown): GraphReply => ({
        id: data.id,
        error: replyError(error),
      }),
    )
    .then(reply => {
      self.postMessage(reply)
    })
}
