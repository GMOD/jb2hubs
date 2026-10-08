// JBrowse launch-URL builders for the /pangenomes pages. Every graph/reference
// specific value comes from the PangenomeDataset, so these builders are
// graph-agnostic. The graph VCF usually isn't in the hosted reference config, so
// we attach it inline via `sessionTracks` (see specUrl) pointing at the public,
// CORS-open VCF — the launch works without first baking the track into the config.

import { specUrl } from './jbrowseLinks.ts'
import { MAX_DETAIL_WINDOW_BP, detailWindow } from './pangenomeLoci.ts'

import type {
  PangenomeDataset,
  PangenomeGraphBrowser,
} from './pangenomeDataset.ts'
import type { PangenomeLocus } from './pangenomeLoci.ts'

// The structural tier, the HPRC tutorial's filter. A span filter (`end -
// start`) would keep only deletions, since an insertion consumes no reference.
// No `INFO.LV[0]==0`: where a parent snarl has no record (vcfwave's HLA-DRB5 and
// HP) it blanks the region, and where it has one (bovine DEFB) it keeps a single
// locus-wide record with a different allele per haplotype.
const SV_FILTER = ['jexl:alleleLength(feature)>=50']

// The graph VCF as an inline session track (public, CORS-open, tabix-indexed).
//
// The matrix display is declared HERE, in the track's own config, rather than
// requested from the view's `tracks` entry. A VariantTrack's default display is
// LinearVariantDisplay, which draws one squashed row for what is a 231-sample /
// 462-haplotype callset, so something has to say otherwise — and the two ways of
// saying it are not equally portable. A session-spec track init carrying inline
// display props relies on core folding them into the display snapshot, which the
// hosted builds ignore: measured against `latest`, that form booted the launch
// with LinearVariantDisplay and the too-much-data banner up, silently. A
// `displays[]` array on the track config is plain configuration, is what the
// HPRC tutorial's own config uses for this exact file, and is what `main`
// honours — verified building the display with `renderingMode`/`jexlFilters`
// intact.
//
// `phased` splits each sample into its two haplotypes — 464 rows rather than 232
// — which is the only form co-inherited blocks are visible in. Requested only
// where the dataset says its genotypes are phased: a `vg deconstruct` callset
// over assembly paths is one haploid column per assembly, and asking for it
// there draws every second row empty.
//
// Undefined where the dataset has no reference-projected callset. That is not a
// gap in the wiring: whether a graph can be deconstructed into one is a property
// of the graph file. `minigraph -cxggs` writes no P or W lines, so the mouse
// graph records no haplotype paths and there is nothing to project.
function graphVcfTrack(dataset: PangenomeDataset) {
  const vcf = dataset.graphVcf
  return vcf
    ? {
        type: 'VariantTrack',
        trackId: vcf.trackId,
        name: vcf.name,
        assemblyNames: [dataset.reference.assembly],
        adapter: {
          type: 'VcfTabixAdapter',
          uri: vcf.url,
          ...(vcf.samplesTsvUrl
            ? { samplesTsvLocation: { uri: vcf.samplesTsvUrl } }
            : {}),
          ...(vcf.fetchSizeLimit ? { fetchSizeLimit: vcf.fetchSizeLimit } : {}),
        },
        displays: [
          {
            type: 'LinearMultiSampleVariantDisplay',
            displayId: `${vcf.trackId}-multisample`,
            ...(vcf.phased ? { renderingMode: 'phased' } : {}),
            jexlFilters: SV_FILTER,
            height: 340,
            ...(vcf.rows ? { rows: vcf.rows } : {}),
            ...(vcf.rowColor ? { rowColor: vcf.rowColor } : {}),
          },
        ],
      }
    : undefined
}

// Reference LinearGenomeView open at `loc`: reference genes, the graph VCF
// (inlined) as a haplotype matrix, and the dataset's structural-variation
// tracks.
function referenceLgvUrl(dataset: PangenomeDataset, loc: string) {
  const vcfTrack = graphVcfTrack(dataset)
  return specUrl(
    dataset.reference.configUrl,
    [
      {
        type: 'LinearGenomeView',
        assembly: dataset.reference.assembly,
        loc,
        tracks: [
          dataset.reference.geneTrackId,
          ...(vcfTrack ? [vcfTrack.trackId] : []),
          ...(dataset.svTrackIds ?? []),
        ],
      },
    ],
    vcfTrack ? [vcfTrack] : [],
  )
}

// A window of the graph, and the one rule that decides how it is drawn.
//
// Under MAX_DETAIL_WINDOW_BP the segment-level lanes are legible: bubbles, the
// allele inventory drawn at each allele's real size off its CIGAR, and the rGFA
// segments. Above it they are not — over a full cattle chromosome the fine
// segments track refuses outright with "Too many features", and the allele
// inventory is past its fetch limit well before that. So a wide window gets the
// coarse tier instead: one row per top-level bubble, plus the
// segments-per-bubble curve, which is what makes a multi-Mb span drawable at
// all.
//
// That split is why there is no separate whole-chromosome builder any more. A
// chromosome is the widest region, and it takes the same coarse branch — and a
// multi-megabase catalog locus, which every earlier version of this file either
// refused a launch for or opened behind a "too much data" banner, now draws.
export interface GraphRegion {
  chrom: string
  start: number
  end: number
  label?: string
}

// The coarse branch needs a tier to switch to. A graph without one can only be
// drawn fine, however wide the ask.
function coarseTier(graph: PangenomeGraphBrowser, region: GraphRegion) {
  return region.end - region.start > MAX_DETAIL_WINDOW_BP
    ? graph.tierTrackId
    : undefined
}

// An rGFA track opens as the graph, its first display, so a lane over one
// names the linear display.
const linearLane = (trackId: string) => ({
  trackId,
  type: 'LinearBasicDisplay',
})

// Over the graph, neither the segments nor the tier lane opens. The segments
// lane is the graph track itself, and a view shows a track once. The graph cuts
// its own tier past the adapter's `coarse.aboveBpPerPx`, which turns on the
// view's width, so a tier lane switched by span would disagree with it: at 1000
// px, HPRC's graph stays fine up to ~1 Mb, and Arabidopsis's goes coarse at
// ~117 kb.
function lanes(
  graph: PangenomeGraphBrowser,
  region: GraphRegion,
  { overGraph = false } = {},
) {
  const tier = coarseTier(graph, region)
  const rearrangements = graph.rearrangementTrack
    ? [graph.rearrangementTrack]
    : []
  return tier
    ? [
        graph.geneTrackId,
        ...(graph.bubbleScoreTrackId ? [graph.bubbleScoreTrackId] : []),
        ...(overGraph ? [] : [linearLane(tier)]),
        ...rearrangements,
      ]
    : [
        graph.geneTrackId,
        graph.bubblesTrackId,
        ...(graph.allelesTrackId ? [graph.allelesTrackId] : []),
        ...(overGraph ? [] : [linearLane(graph.segmentsTrackId)]),
        ...rearrangements,
      ]
}

// A region is 0-based half-open and a locstring 1-based, as a location box
// shows it. Bare digits, not toLocaleString: this runs in the visitor's
// browser, and JBrowse's locstring parser strips commas only, so a locale that
// groups with '.' or a space (de-DE, fr-FR, ru-RU) would produce a region no
// view can navigate to.
const locOf = (region: GraphRegion) =>
  `${region.chrom}:${region.start + 1}-${region.end}`

// The dataset's own linear lanes over one region, out of the GRAPH config
// rather than the reference config. For a dataset with no callset these lanes
// ARE the pangenome view of a locus.
//
// Undefined without a hosted graph config, and that is not a technicality —
// `RgfaTabixAdapter`, `MinigraphBubbleAdapter` and the rest ship in the
// graphgenomeviewer plugin rather than in core, so these lanes are exactly as
// plugin-gated as the graph track.
export function graphLanesUrl(dataset: PangenomeDataset, region: GraphRegion) {
  const graph = dataset.graphBrowser
  return graph
    ? specUrl(graph.configUrl, [
        {
          type: 'LinearGenomeView',
          assembly: dataset.reference.assembly,
          loc: locOf(region),
          tracks: lanes(graph, region),
        },
      ])
    : undefined
}

// The callset (plus SV tracks) over any window, for a region a reader asked
// for. Undefined where the dataset has no callset to open.
export function referenceRegionUrl(
  dataset: PangenomeDataset,
  region: GraphRegion,
) {
  return dataset.graphVcf ? referenceLgvUrl(dataset, locOf(region)) : undefined
}

// The window a locus launch opens on: its detail window where it has one (or is
// narrow enough to be its own), else the whole display span. A wide span is not
// a problem for the lanes, which switch to the coarse tier, but it still is for
// the callset: ~200 bytes/bp of VCF text over these loci, so MHC's 4.97 Mb
// (109,988 records) opens the lane behind "too much data".
export function launchRegion(locus: PangenomeLocus): GraphRegion {
  const { start, end } = detailWindow(locus) ?? locus
  return { chrom: locus.chrom, start, end, label: locus.gene }
}

// A region drawn as the graph itself: one linear view, its lanes above the
// segments track opened as the graph. The graph track cuts the view's window,
// re-cuts as the view moves, and past the adapter's `coarse` handover cuts the
// bubble tier on its own. The configs open it force-directed, the shape
// BandageJS draws, rather than flattened onto the view's x, so the launch names
// no layout.
//
// Undefined when the dataset has no hosted graph.
export function graphRegionUrl(dataset: PangenomeDataset, region: GraphRegion) {
  const graph = dataset.graphBrowser
  if (!graph) {
    return undefined
  }
  const label = region.label ?? locOf(region)
  return specUrl(graph.configUrl, [
    {
      type: 'LinearGenomeView',
      displayName: `${label} graph`,
      assembly: dataset.reference.assembly,
      loc: locOf(region),
      tracks: [
        ...lanes(graph, region, { overGraph: true }),
        { trackId: graph.segmentsTrackId, type: 'LinearGraphDisplay' },
      ],
    },
  ])
}

// The tutorial's eight lanes and the reference draw legibly in 460 px.
const LANE_HEIGHT_PX = 51
const GENE_ROW_HEIGHT_PX = 60

// A window's haplotypes as lanes read from the graph. `rows.kept` decides which
// walks are fetched and drawn and `rows.domain` pins their order, so the
// config's one lane track serves every window; the track's own assemblies are
// only what a host that drops the props would open instead.
//
// Undefined without the lane track or without haplotypes to draw.
export function haplotypeLanesForRegion(
  dataset: PangenomeDataset,
  region: GraphRegion,
  haplotypes: string[],
) {
  const graph = dataset.graphBrowser
  const trackId = graph?.haplotypeLanesTrackId
  if (!graph || !trackId || haplotypes.length === 0) {
    return undefined
  }
  return specUrl(graph.configUrl, [
    {
      type: 'LinearGenomeView',
      assembly: dataset.reference.assembly,
      loc: locOf(region),
      tracks: [
        // The reference lane draws these genes too, but unnamed, so the track
        // stays for its names: one compact transcript per gene, in a row short
        // enough not to push the lanes down.
        {
          trackId: graph.geneTrackId,
          type: 'LinearBasicDisplay',
          geneGlyphMode: 'longestCoding',
          displayMode: 'compact',
          height: GENE_ROW_HEIGHT_PX,
        },
        {
          trackId,
          type: 'MultiWaySyntenyDisplay',
          rows: { kept: haplotypes, domain: haplotypes },
          height: LANE_HEIGHT_PX * (haplotypes.length + 1),
        },
      ],
    },
  ])
}

const BANDAGE_URL = 'https://jbrowse.org/demos/bandagejs/'

// The same haplotypes cut out of the graph in BandageJS and laid out by force,
// the topology no JBrowse launch here draws. The layout is always named, since
// BandageJS otherwise opens in whichever one the visitor last picked, and so
// are the haplotypes, since without them it cuts all 464.
//
// Not walk rows, which would mostly repeat the haplotypes launch and cut whole
// snarls rather than the window. Measured 2026-10-04 over the 19 panels, the
// whole-snarl cut passes BandageJS's 100,000-node limit on SMN, DEFB and HP,
// which then open on an error, while the window alone is 1,315–33,010 nodes.
// MHC and KIR are over the 20,000 BandageJS draws without asking first.
//
// Undefined without a gbz preset or without haplotypes to draw.
export function bandageRegionUrl(
  dataset: PangenomeDataset,
  region: GraphRegion,
  haplotypes: string[],
) {
  if (!dataset.bandageGbz || haplotypes.length === 0) {
    return undefined
  }
  const query = new URLSearchParams({
    gbz: dataset.bandageGbz,
    loc: locOf(region),
    haps: haplotypes.join(','),
    layout: 'force',
  })
  return `${BANDAGE_URL}?${query}`
}

// What a region opens as, in one order, and only what this build can open: a
// builder that answers undefined (no hosted graph, no haplotypes, no callset)
// leaves no link. The callset has no coarse tier, so a window past
// MAX_DETAIL_WINDOW_BP offers no variants launch, where the graph's own lanes
// switch to the tier and stay.
export interface LaunchLink {
  kind: 'graph' | 'variants' | 'bubbles' | 'haplotypes' | 'bandage'
  label: string
  about: string
  url: string
}

export function regionLaunches(
  dataset: PangenomeDataset,
  region: GraphRegion,
  haplotypes: string[] = [],
  { graphCollapsed = false } = {},
): LaunchLink[] {
  const wide = region.end - region.start > MAX_DETAIL_WINDOW_BP
  const links: (Omit<LaunchLink, 'url'> & { url: string | undefined })[] = [
    {
      kind: 'graph',
      label: 'Graph',
      about: 'the region drawn as a graph',
      url: graphCollapsed ? undefined : graphRegionUrl(dataset, region),
    },
    dataset.graphVcf
      ? {
          kind: 'variants',
          label: 'Variants',
          about: 'the structural variants each haplotype carries',
          url: wide ? undefined : referenceRegionUrl(dataset, region),
        }
      : {
          kind: 'bubbles',
          label: 'Bubbles',
          about: 'where the graph branches, as tracks on the reference',
          url: graphLanesUrl(dataset, region),
        },
    {
      kind: 'haplotypes',
      label: 'Haplotypes',
      about: 'one lane per structural form, commonest first',
      url: haplotypeLanesForRegion(dataset, region, haplotypes),
    },
    {
      kind: 'bandage',
      label: 'BandageJS',
      about: 'the same haplotypes, laid out as Bandage draws them',
      url: bandageRegionUrl(dataset, region, haplotypes),
    },
  ]
  return links.flatMap(l => (l.url ? [{ ...l, url: l.url }] : []))
}
