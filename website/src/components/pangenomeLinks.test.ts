import assert from 'node:assert'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'

import {
  ARABIDOPSIS_DATASET,
  ARABIDOPSIS_GRAPH_BROWSER,
  BOVINE_DATASET,
  HPRC_DATASET,
  HPRC_GRAPH_BROWSER,
  MOUSE_DATASET,
} from './pangenomeDataset.ts'
import {
  bandageRegionUrl,
  graphLanesUrl,
  graphRegionUrl,
  haplotypeLanesForRegion,
  launchRegion,
  referenceRegionUrl,
  regionLaunches,
} from './pangenomeLinks.ts'
import {
  MAX_DETAIL_WINDOW_BP,
  PANGENOME_LOCI,
  detailWindow,
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
const cfhr = launchRegion(HPRC_DATASET.loci.find(l => l.id === 'cfhr')!)

// The four forms the sidecar gave CFHR's window on 2026-10-04. Fixed here: a
// unit test reads no sidecar, and the builders take any haplotypes.
const HAPLOTYPES = ['HG00097#1', 'HG00253#2', 'HG00133#1', 'HG00235#2']

const variantsUrl = (
  dataset: Parameters<typeof referenceRegionUrl>[0],
  l: Parameters<typeof launchRegion>[0],
) => referenceRegionUrl(dataset, launchRegion(l))!

// HPRC is the one dataset here with a callset; `graphVcf` is optional on the
// type because mouse's graph records no haplotype paths to project.
const HPRC_VCF = HPRC_DATASET.graphVcf!

test('the variants launch opens the reference LGV at the locus with graph + SV tracks', () => {
  const { config, spec } = parseLaunch(variantsUrl(HPRC_DATASET, locus))
  assert.equal(config, HPRC_DATASET.reference.configUrl)

  const view = spec.views[0]!
  assert.equal(view.type, 'LinearGenomeView')
  assert.equal(view.assembly, HPRC_DATASET.reference.assembly)
  // The detail window, not the 5 Mb display span: the callset cannot be fetched
  // over the latter, so the button's own subject would open undrawn.
  const window = detailWindow(locus)!
  assert.equal(view.loc, `${locus.chrom}:${window.start + 1}-${window.end}`)

  // Reference genes, the graph VCF, then every SV track — in that order.
  assert.deepEqual(view.tracks, [
    HPRC_DATASET.reference.geneTrackId,
    HPRC_VCF.trackId,
    ...HPRC_DATASET.svTrackIds!,
  ])

  // The graph VCF isn't in the hosted config, so it must ride along as a session
  // track pointing at the real data URL.
  const inlined = spec.sessionTracks?.[0]
  assert.equal(inlined?.trackId, HPRC_VCF.trackId)
  assert.deepEqual(inlined?.adapter, {
    type: 'VcfTabixAdapter',
    uri: HPRC_VCF.url,
    fetchSizeLimit: 20_000_000,
  })
})

test('the callset declares the matrix display exactly where the host has it', () => {
  const { spec } = parseLaunch(variantsUrl(HPRC_DATASET, locus))
  const displays = spec.sessionTracks?.[0]?.displays as
    | Record<string, unknown>[]
    | undefined

  // A VariantTrack's default display is the single-row LinearVariantDisplay,
  // which is not what a 231-sample / 462-haplotype callset should open as.
  const display = displays?.[0]
  assert.equal(display?.type, 'LinearMultiSampleVariantDisplay')
  assert.equal(display?.renderingMode, 'phased')
  assert.deepEqual(display?.jexlFilters, ['jexl:alleleLength(feature)>=50'])
})

// --- a dataset with no reference-projected callset -------------------------
//
// mouse's graph is `minigraph -cxggs` output, which writes no P or W lines, so
// there is nothing to deconstruct into a VCF. Everything below is about the
// site staying correct rather than empty when that is true.

test('mouse declares no callset; bovine, whose graph carries path lines, does', () => {
  assert.equal(MOUSE_DATASET.graphVcf, undefined)
  assert.ok(BOVINE_DATASET.graphVcf)
})

test('a rearrangement track opens under the lanes at either tier', () => {
  const dataset = ARABIDOPSIS_DATASET
  const fine = { chrom: 'Chr4', start: 1_700_000, end: 1_750_000 }
  const coarse = { chrom: 'Chr4', start: 0, end: 4_000_000 }
  for (const region of [fine, coarse]) {
    const tracks = parseLaunch(graphLanesUrl(dataset, region)!).spec.views[0]!
      .tracks as unknown[]
    assert.deepEqual(
      tracks.at(-1),
      ARABIDOPSIS_GRAPH_BROWSER.rearrangementTrack,
    )
  }
})

test('an unphased callset does not ask for haplotype rows', () => {
  const { spec } = parseLaunch(
    variantsUrl(BOVINE_DATASET, BOVINE_DATASET.loci[0]!),
  )
  const display = (
    spec.sessionTracks?.[0]?.displays as Record<string, unknown>[] | undefined
  )?.[0]
  // 11 haploid genotype columns from `vg deconstruct`; phased would draw 11
  // empty rows between them.
  assert.equal(display?.renderingMode, undefined)
})

const launchOf = (
  launches: ReturnType<typeof regionLaunches>,
  kind: (typeof launches)[number]['kind'],
) => launches.find(l => l.kind === kind)?.url

test('without a callset a region opens as the graph configs own lanes', () => {
  const narrow = MOUSE_DATASET.loci.find(l => detailWindow(l))!
  const launches = regionLaunches(MOUSE_DATASET, launchRegion(narrow))
  assert.deepEqual(
    launches.map(l => l.kind),
    ['graph', 'bubbles'],
  )
  const { config, spec } = parseLaunch(launchOf(launches, 'bubbles')!)
  assert.equal(config, MOUSE_DATASET.graphBrowser!.configUrl)
  assert.deepEqual(spec.views[0]!.tracks, [
    'mm39_ncbiRefSeq_ucsc',
    'mouse_minigraph_bubbles',
    'mouse_minigraph_alleles',
    { trackId: 'mouse_minigraph_segments', type: 'LinearBasicDisplay' },
  ])
})

// The same builder, the other branch. `loci[0]` is the 2.24 Mb Vmn cluster, and
// this launch used to open the allele inventory — an AlignmentsTrack over 379
// rows — across the whole of it, which is past its fetch limit. It opens the
// tier instead.
test('and over a span the fine lanes cannot draw, it is the tier', () => {
  const wide = MOUSE_DATASET.loci.find(l => detailWindow(l) === undefined)!
  const { spec } = parseLaunch(
    launchOf(regionLaunches(MOUSE_DATASET, launchRegion(wide)), 'bubbles')!,
  )
  assert.deepEqual(spec.views[0]!.tracks, [
    'mm39_ncbiRefSeq_ucsc',
    'mouse_bubble_score',
    { trackId: 'mouse_minigraph_tier', type: 'LinearBasicDisplay' },
  ])
})

test('and with a callset it is the reference view, with the haplotypes as lanes', () => {
  const launches = regionLaunches(HPRC_DATASET, cfhr, HAPLOTYPES)
  assert.deepEqual(
    launches.map(l => l.kind),
    ['graph', 'variants', 'haplotypes', 'bandage'],
  )
  assert.equal(
    launchOf(launches, 'variants'),
    referenceRegionUrl(HPRC_DATASET, cfhr),
  )
  assert.equal(
    launchOf(launches, 'haplotypes'),
    haplotypeLanesForRegion(HPRC_DATASET, cfhr, HAPLOTYPES),
  )
  assert.deepEqual(
    regionLaunches(HPRC_DATASET, cfhr).map(l => l.kind),
    ['graph', 'variants'],
  )
  assert.equal(referenceRegionUrl(MOUSE_DATASET, cfhr), undefined)
})

// The callset has no coarse tier, and a collapsed locus no graph worth opening.
test('a wide window offers the graph alone, and a collapsed locus no graph', () => {
  const wide = { chrom: 'chr6', start: 28_510_000, end: 33_480_000 }
  assert.deepEqual(
    regionLaunches(HPRC_DATASET, wide).map(l => l.kind),
    ['graph'],
  )
  assert.deepEqual(
    regionLaunches(HPRC_DATASET, launchRegion(locus), [], {
      graphCollapsed: true,
    }).map(l => l.kind),
    ['variants'],
  )
})

test('the lanes launch is undefined without a hosted graph config', () => {
  const noGraph = { ...MOUSE_DATASET, graphBrowser: undefined }
  assert.equal(
    graphLanesUrl(noGraph, { chrom: 'chr11', start: 1, end: 1000 }),
    undefined,
  )
  assert.deepEqual(regionLaunches(noGraph, launchRegion(noGraph.loci[0]!)), [])
})

test('a derived catalogue carries what the tier said and claims nothing else', () => {
  for (const d of [MOUSE_DATASET, BOVINE_DATASET, ARABIDOPSIS_DATASET]) {
    assert.ok(d.loci.length > 0, `${d.id} has a catalogue`)
    for (const l of d.loci) {
      const derived = l.derived
      assert.ok(derived, `${d.id}/${l.id} is marked derived`)
      assert.ok(derived.segments > 0, `${d.id}/${l.id} has a segment count`)
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

const graphTrack = {
  trackId: HPRC_GRAPH_BROWSER.segmentsTrackId,
  type: 'LinearGraphDisplay',
}

test('a locus opens as one linear view with the graph under its lanes', () => {
  const url = graphRegionUrl(HPRC_DATASET, launchRegion(locus))
  assert.ok(url, 'MHC has a detailWindow, so a URL is produced')
  const { config, spec } = parseLaunch(url)
  // the graph plugin is declared only in this config, never in the UCSC ones
  assert.equal(config, HPRC_GRAPH_BROWSER.configUrl)

  assert.equal(spec.views.length, 1)
  const [lgv] = spec.views
  assert.equal(lgv!.type, 'LinearGenomeView')
  // the narrow detailWindow, not the 5 Mb display window the locus lists
  assert.equal(lgv!.loc, 'chr6:32510001-32600000')
  // The segments lane is the graph track itself, so it opens once, as the graph
  assert.deepEqual(lgv!.tracks, [
    HPRC_GRAPH_BROWSER.geneTrackId,
    HPRC_GRAPH_BROWSER.bubblesTrackId,
    HPRC_GRAPH_BROWSER.allelesTrackId,
    graphTrack,
  ])
})

test('graphRegionUrl draws an arbitrary window, labelled as given', () => {
  const region = { chrom: 'chr1', start: 100, end: 5_100, label: 'anywhere' }
  const { spec } = parseLaunch(graphRegionUrl(HPRC_DATASET, region)!)
  const [lgv] = spec.views
  assert.equal(lgv!.loc, 'chr1:101-5100')
  assert.equal(lgv!.displayName, 'anywhere graph')
  assert.equal(
    graphRegionUrl({ ...HPRC_DATASET, graphBrowser: undefined }, region),
    undefined,
  )
})

// The graph track picks its own tier by zoom, so a wide launch opens no tier
// lane beside it that could disagree.
test('a wide region opens the graph alone, under the lanes that read at any width', () => {
  const chr21 = { chrom: 'chr21', start: 0, end: 46_709_983 }
  const { config, spec } = parseLaunch(graphRegionUrl(HPRC_DATASET, chr21)!)
  assert.equal(config, HPRC_GRAPH_BROWSER.configUrl)
  assert.equal(spec.views.length, 1)
  const [lgv] = spec.views
  assert.equal(lgv!.loc, 'chr21:1-46709983')
  assert.deepEqual(lgv!.tracks, [
    'hg38_ncbiRefSeq_ucsc',
    'hprc_bubble_score',
    graphTrack,
  ])
  const lanes = parseLaunch(graphLanesUrl(HPRC_DATASET, chr21)!).spec
  assert.deepEqual(lanes.views[0]!.tracks, [
    'hg38_ncbiRefSeq_ucsc',
    'hprc_bubble_score',
    { trackId: 'hprc_minigraph_tier', type: 'LinearBasicDisplay' },
  ])
})

test('a graph with no tier opens the fine lanes however wide the ask', () => {
  const noTier = {
    ...HPRC_DATASET,
    graphBrowser: { ...HPRC_GRAPH_BROWSER, tierTrackId: undefined },
  }
  const chr21 = { chrom: 'chr21', start: 0, end: 46_709_983 }
  const { spec } = parseLaunch(graphRegionUrl(noTier, chr21)!)
  assert.deepEqual(spec.views[0]!.tracks, [
    HPRC_GRAPH_BROWSER.geneTrackId,
    HPRC_GRAPH_BROWSER.bubblesTrackId,
    HPRC_GRAPH_BROWSER.allelesTrackId,
    graphTrack,
  ])
})

// The display types jbrowse-plugin-graphgenomeviewer registers on a
// GraphTrack, read off its published bundle: the graph first, then the linear
// lane. A GraphTrack's displays come from its track type, so its config
// declares none, and a launch is checked against these instead.
const GRAPH_TRACK_DISPLAYS = ['LinearGraphDisplay', 'LinearBasicDisplay']

// A bare trackId opens a track's first display, and an rGFA track's first is
// the graph, so a launch that means its linear lane has to say so.
test('every rGFA track a launch opens names a display its track has', () => {
  const launches = [
    [HPRC_DATASET, { chrom: 'chr6', start: 32_510_000, end: 32_600_000 }],
    [HPRC_DATASET, { chrom: 'chr21', start: 0, end: 46_709_983 }],
    [MOUSE_DATASET, { chrom: 'chr7', start: 0, end: 5_000_000 }],
    [ARABIDOPSIS_DATASET, { chrom: 'Chr4', start: 1_700_000, end: 1_750_000 }],
  ] as const
  for (const [dataset, region] of launches) {
    const base = /pangenome\/([^/]+)\/config\.json$/.exec(
      dataset.graphBrowser!.configUrl,
    )![1]
    const config = JSON.parse(
      readFileSync(
        new URL(`../../pangenome-config/${base}.json`, import.meta.url),
        'utf8',
      ),
    ) as {
      tracks: {
        trackId: string
        type: string
        adapter: { type: string }
        displays?: { type: string }[]
      }[]
    }
    const byId = new Map(config.tracks.map(t => [t.trackId, t]))
    for (const url of [
      graphRegionUrl(dataset, region)!,
      graphLanesUrl(dataset, region)!,
    ]) {
      for (const entry of parseLaunch(url).spec.views[0]!.tracks as (
        | string
        | { trackId: string; type?: string }
      )[]) {
        const { trackId, type } =
          typeof entry === 'string'
            ? { trackId: entry, type: undefined }
            : entry
        const track = byId.get(trackId)
        assert.ok(track, `${trackId} is in ${base}.json`)
        if (track.adapter.type === 'RgfaTabixAdapter') {
          assert.ok(type, `${base}: ${trackId} opens without naming a display`)
          const displays =
            track.type === 'GraphTrack'
              ? GRAPH_TRACK_DISPLAYS
              : (track.displays ?? []).map(d => d.type)
          assert.ok(
            displays.includes(type),
            `${base}: ${trackId} (${track.type}) has no ${type}`,
          )
        }
      }
    }
  }
})

// Half of each derived catalogue is a multi-megabase cluster, and every one of
// them used to have no graph launch at all. They draw their tier now.
test('a wide catalog locus gets a launch rather than nothing', () => {
  const wide = MOUSE_DATASET.loci.filter(l => detailWindow(l) === undefined)
  assert.ok(wide.length > 0, 'the mouse catalogue has wide entries')
  for (const l of wide) {
    assert.ok(
      graphRegionUrl(MOUSE_DATASET, launchRegion(l)),
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

test('the haplotypes launch narrows the lane track to the haplotypes given, in their order', () => {
  const { config, spec } = parseLaunch(
    haplotypeLanesForRegion(HPRC_DATASET, cfhr, HAPLOTYPES)!,
  )
  assert.equal(config, HPRC_GRAPH_BROWSER.configUrl)
  assert.equal(spec.sessionTracks, undefined)
  const view = spec.views[0]!
  assert.equal(view.loc, `${cfhr.chrom}:${cfhr.start + 1}-${cfhr.end}`)
  const [genes, lanes] = view.tracks as Record<string, unknown>[]
  assert.deepEqual(genes, {
    trackId: HPRC_GRAPH_BROWSER.geneTrackId,
    type: 'LinearBasicDisplay',
    geneGlyphMode: 'longestCoding',
    displayMode: 'compact',
    height: 60,
  })
  const { height, ...display } = lanes!
  assert.deepEqual(display, {
    trackId: HPRC_GRAPH_BROWSER.haplotypeLanesTrackId,
    type: 'MultiWaySyntenyDisplay',
    rows: { kept: HAPLOTYPES, domain: HAPLOTYPES },
  })
  assert.equal(typeof height, 'number')
})

test('the haplotypes launch is undefined without the lane track or haplotypes', () => {
  assert.equal(haplotypeLanesForRegion(HPRC_DATASET, cfhr, []), undefined)
  assert.equal(
    haplotypeLanesForRegion(
      { ...HPRC_DATASET, graphBrowser: undefined },
      cfhr,
      HAPLOTYPES,
    ),
    undefined,
  )
  assert.equal(
    haplotypeLanesForRegion(
      {
        ...HPRC_DATASET,
        graphBrowser: {
          ...HPRC_GRAPH_BROWSER,
          haplotypeLanesTrackId: undefined,
        },
      },
      cfhr,
      HAPLOTYPES,
    ),
    undefined,
  )
})

test('bandageRegionUrl cuts the window around the haplotypes given, laid out by force', () => {
  const url = new URL(bandageRegionUrl(HPRC_DATASET, cfhr, HAPLOTYPES)!)
  assert.equal(
    url.origin + url.pathname,
    'https://jbrowse.org/demos/bandagejs/',
  )
  assert.deepEqual(Object.fromEntries(url.searchParams), {
    gbz: 'hprc',
    loc: `${cfhr.chrom}:${cfhr.start + 1}-${cfhr.end}`,
    haps: HAPLOTYPES.join(','),
    layout: 'force',
  })
})

// BandageJS reads the gbz-base database itself, so the link needs no hosted
// graph.
test('bandageRegionUrl is undefined without a gbz preset or haplotypes', () => {
  assert.ok(
    bandageRegionUrl(
      { ...HPRC_DATASET, graphBrowser: undefined },
      cfhr,
      HAPLOTYPES,
    ),
  )
  assert.equal(bandageRegionUrl(HPRC_DATASET, cfhr, []), undefined)
  assert.equal(
    bandageRegionUrl(
      { ...HPRC_DATASET, bandageGbz: undefined },
      cfhr,
      HAPLOTYPES,
    ),
    undefined,
  )
  assert.equal(bandageRegionUrl(MOUSE_DATASET, cfhr, HAPLOTYPES), undefined)
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

test('the one locus flagged as collapsed in the graph is narrow enough to draw', () => {
  // So only the flag stops CYP2D6's graph launch, not the width rule.
  const collapsed = PANGENOME_LOCI.find(l => l.id === 'cyp2d6')!
  assert.ok(collapsed.graphCollapsed)
  assert.ok(detailWindow(collapsed))
})

test('every launched region is bare digits, in every locale', () => {
  // toLocaleString would group with '.' or a space under de-DE/fr-FR/ru-RU, and
  // JBrowse's locstring parser strips commas only — so a grouped region is one
  // no view can navigate to. These builders run in the visitor's browser.
  const region = /^[A-Za-z0-9_.]+:\d+-\d+$/
  for (const l of PANGENOME_LOCI) {
    for (const url of [
      variantsUrl(HPRC_DATASET, l),
      graphRegionUrl(HPRC_DATASET, launchRegion(l)),
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
    const url = graphRegionUrl(HPRC_DATASET, launchRegion(l))
    if (url) {
      const { spec } = parseLaunch(url)
      const [, start, end] = /:(\d+)-(\d+)$/.exec(spec.views[0]!.loc as string)!
      const span = Number(end) - Number(start) + 1
      // A wide locus with no explicit detailWindow must produce no launch rather
      // than one that opens and draws an unreadable thread.
      assert.ok(
        span <= MAX_DETAIL_WINDOW_BP,
        `${l.id} launches a ${span} bp graph window`,
      )
    }
  }
})

test('every locus opens its variants on a window the callset can be fetched over', () => {
  for (const l of PANGENOME_LOCI) {
    const { spec } = parseLaunch(variantsUrl(HPRC_DATASET, l))
    const [, start, end] = /:(\d+)-(\d+)$/.exec(spec.views[0]!.loc as string)!
    const span = Number(end) - Number(start) + 1
    assert.ok(
      span <= MAX_DETAIL_WINDOW_BP,
      `${l.id} opens its callset over ${span} bp`,
    )
  }
})
