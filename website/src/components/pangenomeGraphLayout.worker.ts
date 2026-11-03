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

// One scheme for every walk of the focused haplotype, so a haplotype the cut
// splits into several contigs reads as one; a lone walk draws as before, a
// blue ramp along it.
const FOCUS_COLOR = { scheme: 'blue' } as const

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
  const forgetOnFailure = (key: string, p: Promise<T>) => {
    p.catch(() => {
      if (kept.get(key) === p) {
        kept.delete(key)
      }
    })
    return p
  }
  return (key: string, make: () => Promise<T>) => {
    const p = kept.get(key) ?? forgetOnFailure(key, make())
    kept.delete(key)
    kept.set(key, p)
    for (const stale of [...kept.keys()].slice(0, -KEPT)) {
      kept.delete(stale)
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
  const focused = haplotype
    ? (graph.paths ?? [])
        .filter(p => p.name.startsWith(`${haplotype}#`))
        .map(p => ({ walk: p.name, color: FOCUS_COLOR }))
    : []
  const svg = figureSvg(graph, layout, {
    ...SPEC,
    region: figureRegion(region),
    walks: walkLayers(focused.length > 0 ? focused : undefined),
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
