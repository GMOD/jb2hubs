import assert from 'node:assert'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'

import { features } from '../config/features.ts'
import {
  BOVINE_DATASET,
  HPRC_DATASET,
  HPRC_GRAPH_BROWSER,
  MOUSE_DATASET,
} from './pangenomeDataset.ts'
import {
  geneHubUrl,
  graphLanesUrl,
  graphLocusUrl,
  graphRegionUrl,
  graphVcfLgvUrl,
  haplotypeLanesUrl,
  launchRegion,
  locusLaunchUrl,
} from './pangenomeLinks.ts'
import {
  MAX_DETAIL_WINDOW_BP,
  PANGENOME_LOCI,
  detailWindow,
  syntenyGene,
} from './pangenomeLoci.ts'

// A JBrowse launch URL is `<base>?config=<enc>&session=spec-<enc(json)>`. Decode
// both back so the tests assert on the real spec the browser will expand.
function parseLaunch(url: string) {
  const { searchParams } = new URL(url)
  const session = searchParams.get('session') ?? ''
  assert.ok(session.startsWith('spec-'), 'session is a spec- payload')
  return {
    config: searchParams.get('config') ?? '',
    spec: JSON.parse(session.slice('spec-'.length)) as {
      views: Record<string, unknown>[]
      sessionTracks?: Record<string, unknown>[]
    },
  }
}

const locus = HPRC_DATASET.loci.find(l => l.id === 'mhc-hla')!

// The shipped dataset carries the hosted graph only under features.pangenomeGraph
// (off outside Vite, and on production), so the graph launches are exercised on
// a copy that always has it.
const graphDataset = { ...HPRC_DATASET, graphBrowser: HPRC_GRAPH_BROWSER }

test('the hosted graph reaches the dataset only under its own flag', () => {
  assert.equal(HPRC_DATASET.graphBrowser !== undefined, features.pangenomeGraph)
})

// HPRC is the one dataset here with a callset; `graphVcf` is optional on the
// type because mouse's graph records no haplotype paths to project.
const HPRC_VCF = HPRC_DATASET.graphVcf!

test('graphVcfLgvUrl opens the reference LGV at the locus with graph + SV tracks', () => {
  const { config, spec } = parseLaunch(graphVcfLgvUrl(HPRC_DATASET, locus))
  assert.equal(config, HPRC_DATASET.reference.configUrl)

  const view = spec.views[0]!
  assert.equal(view.type, 'LinearGenomeView')
  assert.equal(view.assembly, HPRC_DATASET.reference.assembly)
  // The detail window, not the 5 Mb display span: the callset cannot be fetched
  // over the latter, so the button's own subject would open undrawn.
  const window = detailWindow(locus)!
  assert.equal(view.loc, `${locus.chrom}:${window.start}-${window.end}`)

  // Reference genes, the graph VCF, then every SV track — in that order.
  assert.deepEqual(view.tracks, [
    HPRC_DATASET.reference.geneTrackId,
    HPRC_VCF.trackId,
    ...HPRC_DATASET.svTrackIds,
  ])

  // The graph VCF isn't in the hosted config, so it must ride along as a session
  // track pointing at the real data URL.
  const inlined = spec.sessionTracks?.[0]
  assert.equal(inlined?.trackId, HPRC_VCF.trackId)
  assert.deepEqual(inlined?.adapter, {
    type: 'VcfTabixAdapter',
    uri: HPRC_VCF.url,
  })
})

test('the callset declares the matrix display exactly where the host has it', () => {
  const { spec } = parseLaunch(graphVcfLgvUrl(HPRC_DATASET, locus))
  const displays = spec.sessionTracks?.[0]?.displays as
    | Record<string, unknown>[]
    | undefined

  // A VariantTrack's default display is the single-row LinearVariantDisplay,
  // which is not what a 232-sample / 464-haplotype callset should open as.
  const display = displays?.[0]
  assert.equal(display?.type, 'LinearMultiSampleVariantDisplay')
  assert.equal(display?.renderingMode, 'phased')
  // Both halves of the standard pangenome-VCF filter.
  const filters = display?.jexlFilters as string[]
  assert.ok(filters.some(f => f.includes('LV[0]==0')))
  assert.ok(filters.some(f => f.includes('alleleLength(feature)>=50')))
})

// --- a dataset with no reference-projected callset -------------------------
//
// mouse's graph is `minigraph -cxggs` output, which writes no P or W lines, so
// there is nothing to deconstruct into a VCF. Everything below is about the
// site staying correct rather than empty when that is true.

// The shipped mouse dataset only carries `graphBrowser` under
// features.pangenomeGraph, and for mouse that gates the LINEAR lanes too — all
// three adapters ship in the graphgenomeviewer plugin.
const mouseGraph = {
  ...MOUSE_DATASET,
  graphBrowser: MOUSE_DATASET.graphBrowser ?? {
    configUrl: 'https://jbrowse.org/pangenome/mouse-mm39/config.json',
    segmentsTrackId: 'mouse_minigraph_segments',
    bubblesTrackId: 'mouse_minigraph_bubbles',
    geneTrackId: 'mm39_ncbiRefSeq_ucsc',
    allelesTrackId: 'mouse_minigraph_alleles',
    tierTrackId: 'mouse_minigraph_tier',
  },
}

test('mouse declares no callset; bovine, whose graph carries path lines, does', () => {
  assert.equal(MOUSE_DATASET.graphVcf, undefined)
  assert.ok(BOVINE_DATASET.graphVcf)
})

test('the reference launch omits the callset track entirely when there is none', () => {
  const { spec } = parseLaunch(
    graphVcfLgvUrl(MOUSE_DATASET, MOUSE_DATASET.loci[0]!),
  )
  // Not a trackId naming a track that does not exist, and no session track
  // pointing at a file that was never built: the lane is simply absent.
  assert.deepEqual(spec.views[0]!.tracks, [MOUSE_DATASET.reference.geneTrackId])
  assert.equal(spec.sessionTracks, undefined)
})

test('an unphased callset does not ask for haplotype rows', () => {
  const { spec } = parseLaunch(
    graphVcfLgvUrl(BOVINE_DATASET, BOVINE_DATASET.loci[0]!),
  )
  const display = (
    spec.sessionTracks?.[0]?.displays as Record<string, unknown>[] | undefined
  )?.[0]
  // 11 haploid genotype columns from `vg deconstruct`; phased would draw 11
  // empty rows between them.
  assert.equal(display?.renderingMode, undefined)
})

test('without a callset the primary launch is the graph configs own lanes', () => {
  const narrow = mouseGraph.loci.find(l => detailWindow(l))!
  const { config, spec } = parseLaunch(locusLaunchUrl(mouseGraph, narrow)!)
  assert.equal(config, mouseGraph.graphBrowser.configUrl)
  assert.deepEqual(spec.views[0]!.tracks, [
    'mm39_ncbiRefSeq_ucsc',
    'mouse_minigraph_bubbles',
    'mouse_minigraph_alleles',
    'mouse_minigraph_segments',
  ])
})

// The same builder, the other branch. `loci[0]` is the 2.24 Mb Vmn cluster, and
// this launch used to open the allele inventory — an AlignmentsTrack over 379
// rows — across the whole of it, which is past its fetch limit. It opens the
// tier instead, and the dashboard says why.
test('and over a span the fine lanes cannot draw, it is the tier', () => {
  const wide = mouseGraph.loci.find(l => detailWindow(l) === undefined)!
  const { spec } = parseLaunch(locusLaunchUrl(mouseGraph, wide)!)
  assert.deepEqual(spec.views[0]!.tracks, [
    'mm39_ncbiRefSeq_ucsc',
    'mouse_minigraph_tier',
  ])
})

test('and with a callset it is still the reference view', () => {
  const url = locusLaunchUrl(HPRC_DATASET, locus)
  assert.equal(url, graphVcfLgvUrl(HPRC_DATASET, locus))
})

test('the lanes launch is undefined without a hosted graph config', () => {
  const noGraph = { ...MOUSE_DATASET, graphBrowser: undefined }
  assert.equal(
    graphLanesUrl(noGraph, { chrom: 'chr11', start: 1, end: 1000 }),
    undefined,
  )
  assert.equal(locusLaunchUrl(noGraph, noGraph.loci[0]!), undefined)
})

test('a derived catalogue carries what the tier said and claims nothing else', () => {
  for (const d of [MOUSE_DATASET, BOVINE_DATASET]) {
    assert.ok(d.loci.length > 0, `${d.id} has a catalogue`)
    for (const l of d.loci) {
      const derived = l.derived
      assert.ok(derived, `${d.id}/${l.id} is marked derived`)
      assert.ok(derived.segments > 0, `${d.id}/${l.id} has a segment count`)
      // The tier's only variation claim is its inversion flag, so a derived
      // locus carries that class or none. A guessed badge would read exactly
      // like a curated one.
      assert.ok(
        l.variation.every(v => v === 'inversion'),
        `${d.id}/${l.id} claims ${l.variation.join()}`,
      )
    }
    // Ranked by segments per bubble, descending — that ordering is the whole
    // claim the catalogue makes.
    const counts = d.loci.map(l => l.derived!.segments)
    assert.deepEqual(
      counts,
      [...counts].sort((a, b) => b - a),
    )
  }
})

test('geneHubUrl seeds the marker gene and reference taxon', () => {
  const url = geneHubUrl(HPRC_DATASET, locus)
  assert.ok(url)
  const { pathname, searchParams } = new URL(url, 'https://example.org')
  assert.equal(pathname, '/gene')
  // First pangene marker for MHC is HLA-A.
  assert.equal(searchParams.get('gene'), 'HLA-A')
  assert.equal(searchParams.get('ref'), String(HPRC_DATASET.reference.taxonId))
})

test('a derived locus seeds the hub from the tiers gene list, or not at all', () => {
  // Its `gene` is a label the generator composed, so splitting THAT is what
  // produced `Gm10439,` with the comma on it and `Vmn` from
  // "Vmn cluster (18 genes)" -- three hub links that find nothing, and one
  // (`chr9:87,086,686`) that is not a gene name at all.
  for (const d of [MOUSE_DATASET, BOVINE_DATASET]) {
    for (const l of d.loci) {
      const gene = syntenyGene(l)
      const genes = l.derived!.genes
      if (genes.length === 0) {
        assert.equal(gene, undefined, `${d.id}/${l.id} offers a hub link`)
        assert.equal(geneHubUrl(d, l), undefined)
      } else {
        assert.ok(gene && genes.includes(gene), `${d.id}/${l.id} seeds ${gene}`)
        // A cluster's alphabetically-first member is often an unnamed LOC id,
        // which no ortholog table is keyed on.
        assert.equal(
          gene.startsWith('LOC'),
          genes.every(g => g.startsWith('LOC')),
          `${d.id}/${l.id} seeds ${gene} out of ${genes.join()}`,
        )
      }
    }
  }
})

test('graphLocusUrl opens the graph on the locus, paired with a linear view', () => {
  const url = graphLocusUrl(graphDataset, locus)
  assert.ok(url, 'MHC has a detailWindow, so a URL is produced')
  const { config, spec } = parseLaunch(url)
  // the graph plugin is declared only in this config, never in the UCSC ones
  assert.equal(config, HPRC_GRAPH_BROWSER.configUrl)

  const [lgv, graph] = spec.views
  assert.equal(lgv!.type, 'LinearGenomeView')
  assert.equal(graph!.type, 'GraphGenomeView')
  // the pairing that gives the two panels their hover sync
  assert.equal(graph!.connectedViewId, lgv!.id)
  assert.equal(graph!.loadedTrackId, HPRC_GRAPH_BROWSER.segmentsTrackId)
  // under the default force layout there is no shared axis, so the ramp is what
  // ties a node to the block above it
  assert.equal(graph!.colorScheme, 'reference-position')
  // the narrow detailWindow, not the 5 Mb display window the locus lists
  assert.deepEqual(graph!.loadedRegion, {
    refName: 'chr6',
    assemblyName: 'hg38',
    start: 32_510_000,
    end: 32_600_000,
  })
})

test('graphRegionUrl draws an arbitrary window, labelled as given', () => {
  const region = { chrom: 'chr1', start: 100, end: 5_100, label: 'anywhere' }
  const { spec } = parseLaunch(graphRegionUrl(graphDataset, region)!)
  const [lgv, graph] = spec.views
  assert.equal(lgv!.loc, 'chr1:100-5100')
  assert.equal(graph!.displayName, 'anywhere graph')
  assert.deepEqual(graph!.loadedRegion, {
    refName: 'chr1',
    assemblyName: 'hg38',
    start: 100,
    end: 5_100,
  })
  assert.equal(
    graphRegionUrl({ ...HPRC_DATASET, graphBrowser: undefined }, region),
    undefined,
  )
})

// The whole-chromosome launch used to be its own builder. `lanes()` picks the
// tier by span now, so a chromosome is the widest region and takes the same
// coarse branch as any window past MAX_DETAIL_WINDOW_BP.
test('a wide region is drawn from the tier, with maxRegionBp raised', () => {
  const chr21 = { chrom: 'chr21', start: 0, end: 46_709_983 }
  const { config, spec } = parseLaunch(graphRegionUrl(graphDataset, chr21)!)
  assert.equal(config, HPRC_GRAPH_BROWSER.configUrl)
  const [lgv, graph] = spec.views
  assert.equal(lgv!.loc, 'chr21:0-46709983')
  // The tier's own lane and the variability curve, not the segment-level lanes
  // -- over a span this wide the fine segments track refuses outright.
  assert.deepEqual(lgv!.tracks, [
    'hg38_ncbiRefSeq_ucsc',
    'hprc_bubble_score',
    'hprc_minigraph_tier',
  ])
  assert.equal(graph!.loadedTrackId, 'hprc_minigraph_tier')
  // the 5 Mb default would refuse the cut outright
  assert.equal(graph!.maxRegionBp, 46_709_983)
  // a tier is one node per bubble in reference order, which a force layout
  // draws as an arc
  assert.equal(graph!.layoutMode, 'auto')
  assert.equal(graph!.connectedViewId, lgv!.id)
})

test('a graph with no tier is drawn fine however wide the ask', () => {
  const noTier = {
    ...graphDataset,
    graphBrowser: { ...HPRC_GRAPH_BROWSER, tierTrackId: undefined },
  }
  const chr21 = { chrom: 'chr21', start: 0, end: 46_709_983 }
  const { spec } = parseLaunch(graphRegionUrl(noTier, chr21)!)
  const [lgv, graph] = spec.views
  assert.deepEqual(lgv!.tracks, [
    HPRC_GRAPH_BROWSER.geneTrackId,
    HPRC_GRAPH_BROWSER.bubblesTrackId,
    HPRC_GRAPH_BROWSER.allelesTrackId,
    HPRC_GRAPH_BROWSER.segmentsTrackId,
  ])
  assert.equal(graph!.loadedTrackId, HPRC_GRAPH_BROWSER.segmentsTrackId)
  assert.equal(graph!.maxRegionBp, undefined)
})

// Half of each derived catalogue is a multi-megabase cluster, and every one of
// them used to have no graph launch at all: `graphLocusUrl` returned undefined
// without a detail window. They draw their tier now, so every card in a
// catalogue is openable.
test('a wide catalog locus gets a launch rather than nothing', () => {
  const wide = MOUSE_DATASET.loci.filter(l => detailWindow(l) === undefined)
  assert.ok(wide.length > 0, 'the mouse catalogue has wide entries')
  for (const l of wide) {
    assert.ok(
      graphLocusUrl(mouseGraph, l),
      `${l.id} (${l.end - l.start} bp) has no graph launch`,
    )
  }
})

test('the owned graph config names every track the launches open', () => {
  const config = JSON.parse(
    readFileSync(
      new URL('../../pangenome-config/hprc-grch38.json', import.meta.url),
      'utf8',
    ),
  ) as { tracks: { trackId: string }[] }
  const ids = new Set(config.tracks.map(t => t.trackId))
  const g = HPRC_GRAPH_BROWSER
  for (const id of [
    g.segmentsTrackId,
    g.bubblesTrackId,
    g.geneTrackId,
    g.allelesTrackId,
    g.tierTrackId,
    g.bubbleScoreTrackId,
    g.haplotypeLanesTrackId,
  ]) {
    assert.ok(id && ids.has(id), `${id} is in hprc-grch38.json`)
  }
})

test('haplotypeLanesUrl narrows the lane track to the locus panel, in panel order', () => {
  const cfhr = HPRC_DATASET.loci.find(l => l.id === 'cfhr')!
  const panel = HPRC_DATASET.panels!.cfhr!
  const { config, spec } = parseLaunch(haplotypeLanesUrl(graphDataset, cfhr)!)
  assert.equal(config, HPRC_GRAPH_BROWSER.configUrl)
  assert.equal(spec.sessionTracks, undefined)
  const view = spec.views[0]!
  const region = launchRegion(cfhr)
  assert.equal(view.loc, `${region.chrom}:${region.start}-${region.end}`)
  const [genes, lanes] = view.tracks as [string, Record<string, unknown>]
  assert.equal(genes, HPRC_GRAPH_BROWSER.geneTrackId)
  const haplotypes = panel.lanes.map(l => l.haplotype)
  const { height, ...display } = lanes
  assert.deepEqual(display, {
    trackId: HPRC_GRAPH_BROWSER.haplotypeLanesTrackId,
    type: 'MultiWaySyntenyDisplay',
    laneFilter: { only: haplotypes },
    domain: haplotypes,
  })
  assert.equal(typeof height, 'number')
})

test('haplotypeLanesUrl is undefined without the lane track or a panel', () => {
  const cfhr = HPRC_DATASET.loci.find(l => l.id === 'cfhr')!
  const rhd = HPRC_DATASET.loci.find(l => l.id === 'rhd')!
  assert.equal(HPRC_DATASET.panels?.rhd, undefined)
  assert.equal(haplotypeLanesUrl(graphDataset, rhd), undefined)
  assert.equal(
    haplotypeLanesUrl({ ...HPRC_DATASET, graphBrowser: undefined }, cfhr),
    undefined,
  )
  assert.equal(
    haplotypeLanesUrl(
      {
        ...graphDataset,
        graphBrowser: {
          ...HPRC_GRAPH_BROWSER,
          haplotypeLanesTrackId: undefined,
        },
      },
      cfhr,
    ),
    undefined,
  )
})

// The adapter names a lane after the assembly `assemblyNameToPanSN` maps its
// haplotype to, and the launch filters by PanSN prefix; the display compares
// the two through the assembly manager. Without the alias, a panel naming
// HG00099#1 silently draws without it: measured on CFHR, 6 of 8 lanes.
test('every haplotype the lane track maps to an assembly is that assembly alias', () => {
  const config = JSON.parse(
    readFileSync(
      new URL('../../pangenome-config/hprc-grch38.json', import.meta.url),
      'utf8',
    ),
  ) as {
    assemblies: { name: string; aliases?: string[] }[]
    tracks: {
      trackId: string
      adapter: {
        assemblyNames?: string[]
        assemblyNameToPanSN?: Record<string, string>
      }
    }[]
  }
  const track = config.tracks.find(
    t => t.trackId === HPRC_GRAPH_BROWSER.haplotypeLanesTrackId,
  )!
  const anchor = track.adapter.assemblyNames?.[0]
  const mapped = Object.entries(track.adapter.assemblyNameToPanSN ?? {})
  assert.ok(mapped.length > 1)
  for (const [name, pansn] of mapped.filter(([name]) => name !== anchor)) {
    const assembly = config.assemblies.find(a => a.name === name)
    assert.ok(assembly?.aliases?.includes(pansn), `${name} is aliased ${pansn}`)
  }
})

test('graphLocusUrl is undefined without a hosted graph', () => {
  const noGraph = { ...HPRC_DATASET, graphBrowser: undefined }
  assert.equal(graphLocusUrl(noGraph, locus), undefined)
})

test('graphLocusUrl is undefined where the graph collapses the locus', () => {
  // CYP2D6's window is small enough to draw, so only the explicit flag stops it.
  const collapsed = PANGENOME_LOCI.find(l => l.id === 'cyp2d6')!
  assert.ok(collapsed.graphCollapsed)
  assert.ok(detailWindow(collapsed), 'and it is not the width rule doing it')
  assert.equal(graphLocusUrl(graphDataset, collapsed), undefined)
})

test('every launched region is bare digits, in every locale', () => {
  // toLocaleString would group with '.' or a space under de-DE/fr-FR/ru-RU, and
  // JBrowse's locstring parser strips commas only — so a grouped region is one
  // no view can navigate to. These builders run in the visitor's browser.
  const region = /^[A-Za-z0-9_.]+:\d+-\d+$/
  for (const l of PANGENOME_LOCI) {
    for (const url of [
      graphVcfLgvUrl(HPRC_DATASET, l),
      graphLocusUrl(graphDataset, l),
    ]) {
      if (url) {
        for (const view of parseLaunch(url).spec.views) {
          if (typeof view.loc === 'string') {
            assert.match(view.loc, region, `${l.id} launches loc "${view.loc}"`)
          }
        }
      }
    }
  }
})

test('every locus either draws a window a graph can hold, or none at all', () => {
  for (const l of PANGENOME_LOCI) {
    const url = graphLocusUrl(graphDataset, l)
    if (url) {
      const { spec } = parseLaunch(url)
      const region = spec.views[1]!.loadedRegion as {
        start: number
        end: number
      }
      // A wide locus with no explicit detailWindow must produce no launch rather
      // than one that opens and draws an unreadable thread.
      assert.ok(
        region.end - region.start <= MAX_DETAIL_WINDOW_BP,
        `${l.id} launches a ${region.end - region.start} bp graph window`,
      )
    }
  }
})

test('every locus opens its variants on a window the callset can be fetched over', () => {
  for (const l of PANGENOME_LOCI) {
    const { spec } = parseLaunch(graphVcfLgvUrl(HPRC_DATASET, l))
    const [, start, end] = /:(\d+)-(\d+)$/.exec(spec.views[0]!.loc as string)!
    assert.ok(
      Number(end) - Number(start) <= MAX_DETAIL_WINDOW_BP,
      `${l.id} opens its callset over ${Number(end) - Number(start)} bp`,
    )
  }
})
