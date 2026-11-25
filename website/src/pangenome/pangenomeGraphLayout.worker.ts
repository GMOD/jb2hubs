// SPDX-License-Identifier: GPL-3.0-or-later
// The one module that imports @jbrowse/bandage-core, which is GPL-3.0, and
// only PangenomeGraph.tsx starts it: the site as deployed is distributed under
// GPL terms, and its source is public.

import { figureSvg } from '@jbrowse/bandage-core/figure'
import { walkLayers } from '@jbrowse/bandage-core/figureData'
import { layoutEngine } from '@jbrowse/bandage-core/layoutEngines'
import { pathOrigin } from '@jbrowse/bandage-core/pathAnchoring'
import {
  engineSettingsOf,
  forceLayout,
  loadGraph,
} from '@jbrowse/bandage-core/pipeline'
import { foldThreads, threadLayers } from '@jbrowse/bandage-core/threadFold'
import { encodingSwatchCss } from '@jbrowse/bandage-core/walkEncoding'
import { walkLift } from '@jbrowse/bandage-core/walkHighlight'

import { litSwatches, windowKey } from './pangenomeGraphLayout.ts'
import { abridgedWalks, cutWalks, walkReader } from './pangenomeWalkCut.ts'
import { serve } from './pangenomeWorkerClient.ts'

import type { Drawn, GraphRequest } from './pangenomeGraphLayout.ts'
import type { ParsedRegion, WindowGene } from './pangenomeRegion.ts'
import type { Graph } from '@jbrowse/bandage-core/types'
import type { WalkLayer } from '@jbrowse/bandage-core/walkEncoding'

const SPEC = {
  // Plain JS: the reference drawn straight, an allele as a lens and a deletion
  // as an arch. FMMM is 434 KB of wasm and draws a tangle at this size.
  engine: 'stress',
  nodeWidth: 'depth',
  colorScheme: 'grey',
  // half bandage-core's 6: Colin found the thick paths distracting (2026-11-25)
  contigThickness: 3,
  // A lit thread is as wide as its share of the haplotypes, and a node or
  // loop some leave out carries its share. At the log of its count, CFH's
  // deletion on 137 haplotypes drew 12.8 px and the 314 on the reference
  // would have drawn 14.5: the arc took all the emphasis and nothing said how
  // many follow the reference.
  countLaneWidth: 'share',
  nodeShares: true,
  // twice bandage-core's 0.3, so a row past the four lit still shows at this
  // node width: Colin found the unlit branches "super dim grey" (2026-11-25)
  liftFade: 0.6,
  width: 900,
  // room for a loop to draw across the width; a flat cut still draws 160 px
  height: 400,
} as const

// A lit row's colour, by its place: the reference's blue, the row a visit
// opens on or a click picks orange, then the next two commonest. bandage-core
// has four families, so a fifth row is seen by clicking it.
const LIT_SCHEMES = ['blue', 'red', 'purple', 'green'] as const

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

// Every difference between the walks under this many bp is merged into the
// reference, and the haplotypes that then take one route are drawn as one
// thread, as wide as their count. Unfolded, CFH / CFHR's window is 7,416 nodes
// and a comb of SNP bubbles; folded it is 12, the 85 kb deletion an arc over
// them (measured 2026-11-25 over the 18 HPRC examples).
const FOLD_BELOW_BP = 1000

// The most nodes a folded cut may hold. AMY1's window folds to 158 nodes in
// 172 threads, at 1 kb and at 10 kb alike, and draws a tangle; the largest
// that reads, FCGR's, folds to 21.
const FOLDED_NODE_LIMIT = 60

class TooTangled extends Error {
  readonly regionTooLarge = true
  constructor(nodes: number) {
    super(`the window folds to ${nodes} nodes, over ${FOLDED_NODE_LIMIT}`)
    this.name = 'TooTangled'
  }
}

async function layOut(
  walksUrl: string,
  region: ParsedRegion,
  expand: string[],
) {
  const tables = await cutOf(walksUrl, region, expand)
  const { graph } = foldThreads(
    loadGraph(tables, `${region.chrom}:${region.start}-${region.end}`),
    FOLD_BELOW_BP,
  )
  if (graph.nodes.length > FOLDED_NODE_LIMIT) {
    throw new TooTangled(graph.nodes.length)
  }
  const { result } = await forceLayout(
    graph,
    engineSettingsOf(SPEC),
    layoutEngine,
  )
  return { graph, layout: result, abridged: abridgedWalks(tables) }
}

// The window's genes as the figure pins them: on the reference as the graph
// names it, each outlined over its whole span, since the page's genes carry
// no exons.
const pinned = (genes: WindowGene[], referencePath: string | undefined) =>
  referencePath
    ? genes.map(({ symbol, start, end }) => ({
        name: symbol,
        refName: pathOrigin(referencePath).name,
        start,
        end,
        strand: 1,
        exons: [{ start, end }],
      }))
    : []

const swatches = (graph: Graph, layers: WalkLayer[], lit: string[]) =>
  litSwatches(
    (walkLift(graph, layers)?.walks ?? []).map(w => ({
      picks: w.picked ?? [w.name],
      swatch: encodingSwatchCss(w.encoding),
    })),
    lit,
  )

async function drawRegion(
  { walksUrl, haplotype, lit, expand, genes }: GraphRequest,
  region: ParsedRegion,
): Promise<Drawn> {
  const shown = abridgedWalks(await cutOf(walksUrl, region, []))
  const full = [...new Set(haplotype ? [haplotype, ...expand] : expand)]
    .filter(h => shown.some(w => w.haplotype === h))
    .toSorted()
  const { graph, layout, abridged } = await layouts(
    cutKey(walksUrl, region, full),
    () => layOut(walksUrl, region, full),
  )
  const walkNames = (graph.paths ?? []).flatMap(p => [
    p.name,
    ...(p.members ?? []),
  ])
  const focused = threadLayers(
    graph,
    lit
      .slice(0, LIT_SCHEMES.length)
      .flatMap((h, i) =>
        walkNames
          .filter(name => name.startsWith(`${h}#`))
          .map(walk => ({ walk, color: { scheme: LIT_SCHEMES[i] } })),
      ),
  )
  const svg = figureSvg(graph, layout, {
    ...SPEC,
    region: figureRegion(region),
    genes: pinned(genes, graph.referencePath),
    walks: walkLayers(focused.length > 0 ? focused : undefined),
  })
  return {
    image: `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`,
    region,
    abridged,
    lit: swatches(graph, focused, lit),
  }
}

const tooLarge = (e: unknown) => e instanceof Error && 'regionTooLarge' in e

// The first of the request's regions the page can draw: a window too large to
// cut, or too tangled once folded, gives way to the next.
async function drawGraph(request: GraphRequest): Promise<Drawn> {
  const [region, ...narrower] = request.regions
  return region
    ? drawRegion(request, region).catch((e: unknown) =>
        narrower.length > 0 && tooLarge(e)
          ? drawGraph({ ...request, regions: narrower })
          : Promise.reject(e instanceof Error ? e : new Error(String(e))),
      )
    : Promise.reject(new Error('no region to draw'))
}

serve(drawGraph)
