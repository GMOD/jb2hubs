// JBrowse launch-URL builders for the /pangenomes pages. Every graph/reference
// specific value comes from the PangenomeDataset, so these builders are
// graph-agnostic. The graph VCF usually isn't in the hosted reference config, so
// we attach it inline via `sessionTracks` (see specUrl) pointing at the public,
// CORS-open VCF — the launch works without first baking the track into the config.

import { specUrl } from './jbrowseLinks.ts'
import {
  MAX_DETAIL_WINDOW_BP,
  detailWindow,
  syntenyGene,
} from './pangenomeLoci.ts'

import type {
  PangenomeDataset,
  PangenomeGraphBrowser,
} from './pangenomeDataset.ts'
import type { PangenomeLocus } from './pangenomeLoci.ts'

// Pins the linear view's id so the graph can name it as its hover-sync partner.
// A session spec may set a view id (LaunchLinearGenomeView takes one for exactly
// this), and both views come from the same spec, so the constant is safe.
const LGV_ID = 'pangenome-locus-lgv'

// The two halves of the standard pangenome-VCF filter, which the HPRC tutorial
// argues belong together and which this file applies wherever it opens the
// callset:
//
// - `alleleLength(feature)>=50` is the structural tier, the tier the graph
//   itself records. `end - start` would not do: an insertion consumes no
//   reference, so a span filter keeps only deletions.
// - `INFO.LV[0]==0` keeps the top level of vg's snarl tree, which is the tier
//   the graph's own bubbles are.
//
// The tutorial's filter verbatim, deliberately: it is what its published figures
// of this callset use. Know what the LV half costs, because it is not free. LV=0
// and LV>0 records in this file are spatially DISJOINT, so filtering does not
// thin a region, it blanks the regions that are nested, and LV=0 is not always
// the top level: where the pipeline dropped a parent snarl's own record, its
// LV=1 children are the top level and the filter hides them all.
//
// - MHC's detail window, measured 2026-08-06: all 2,688 nested records fall in
//   one 22 kb stretch, 32,570,542-32,592,610, which is HLA-DRB1
//   (32,578,775-32,589,848), so DRB1 draws empty in a window widened to reach
//   it.
// - HP's window, measured 2026-09-17: all 448 LV=1 records hang off one snarl,
//   `>76082598>76084298`, that has no record in the file. They include a
//   1,716 bp deletion carried by 190 of 461 haplotypes, and the one record the
//   filter keeps is a 302 bp deletion carried by 5.
//
// Kept anyway, to stay the tutorial's filter verbatim. The fix is to keep a
// record whose `PS` names a snarl with no record of its own, which no jexl over
// one record can test, so it would be precomputed per window the way the panels
// are.
const SV_FILTER = ['jexl:feature.INFO.LV[0]==0 && alleleLength(feature)>=50']

// The graph VCF as an inline session track (public, CORS-open, tabix-indexed).
//
// The matrix display is declared HERE, in the track's own config, rather than
// requested from the view's `tracks` entry. A VariantTrack's default display is
// LinearVariantDisplay, which draws one squashed row for what is a 232-sample /
// 464-haplotype callset, so something has to say otherwise — and the two ways of
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
        adapter: { type: 'VcfTabixAdapter', uri: vcf.url },
        displays: [
          {
            type: 'LinearMultiSampleVariantDisplay',
            displayId: `${vcf.trackId}-multisample`,
            ...(vcf.phased ? { renderingMode: 'phased' } : {}),
            jexlFilters: SV_FILTER,
            height: 340,
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
          ...dataset.svTrackIds,
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

function lanes(graph: PangenomeGraphBrowser, region: GraphRegion) {
  const tier = coarseTier(graph, region)
  return tier
    ? [
        graph.geneTrackId,
        ...(graph.bubbleScoreTrackId ? [graph.bubbleScoreTrackId] : []),
        tier,
      ]
    : [
        graph.geneTrackId,
        graph.bubblesTrackId,
        ...(graph.allelesTrackId ? [graph.allelesTrackId] : []),
        graph.segmentsTrackId,
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
// plugin-gated as the graph pane beside them.
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

// The graph variants (plus SV tracks) open at a catalog locus.
//
// The window is the locus's detail window where it has one. The callset is
// fetched per view and runs ~200 bytes/bp of VCF text over these loci, so a
// multi-Mb span (MHC's is 4.97 Mb, holding 109,988 records) opens the lane
// behind the "too much data" banner — the button's own subject, undrawn. Every
// window the tutorial draws this callset on is 70–130 kb.
export function graphVcfLgvUrl(
  dataset: PangenomeDataset,
  locus: PangenomeLocus,
) {
  return referenceLgvUrl(dataset, locOf(launchRegion(locus)))
}

// The window a locus launch opens on: its detail window where it has one (or is
// narrow enough to be its own), else the whole display span. A wide span is not
// a problem for the lanes any more — `lanes()` switches to the coarse tier —
// but it still is for the callset, which is why `graphVcfLgvUrl` says so.
export function launchRegion(locus: PangenomeLocus): GraphRegion {
  const { start, end } = detailWindow(locus) ?? locus
  return { chrom: locus.chrom, start, end, label: locus.gene }
}

// The launch a locus's primary button should make: the callset beside the
// reference genes where the dataset has one, else the graph's own lanes. Both
// open on the same window, so the two datasets differ in what is IN the view
// rather than in where it lands.
export function locusLaunchUrl(
  dataset: PangenomeDataset,
  locus: PangenomeLocus,
) {
  return dataset.graphVcf
    ? graphVcfLgvUrl(dataset, locus)
    : graphLanesUrl(dataset, launchRegion(locus))
}

// A region drawn as the graph itself, under a linear view of the same window.
// `loadedTrackId`/`loadedRegion` are plain persisted view props, so the graph
// opens on the region directly rather than the user rubberbanding to it; the
// shared `id`/`connectedViewId` pairs the two panels for hover sync.
//
// `colorScheme` is the one thing that ties the two panels together under the
// default force layout, which has no axis to share: the ramp runs red at the
// start of the loaded window to magenta at its end, and a segment with no
// reference coordinate comes off the ramp as charcoal.
//
// The coarse branch differs in three ways, all forced by the tier. It loads the
// tier rather than the segments; it raises `maxRegionBp` to the span, since the
// view refuses a wider cut as a proxy for node count and a tier breaks that
// proxy (`maxGraphNodes` stays as the real ceiling); and it lays out anchored,
// because a tier is one node per bubble in reference order — a chain, which a
// force layout draws as an arc.
//
// Undefined when the dataset has no hosted graph.
export function graphRegionUrl(dataset: PangenomeDataset, region: GraphRegion) {
  const graph = dataset.graphBrowser
  if (!graph) {
    return undefined
  }
  const tier = coarseTier(graph, region)
  const label = region.label ?? locOf(region)
  return specUrl(graph.configUrl, [
    {
      type: 'LinearGenomeView',
      id: LGV_ID,
      assembly: dataset.reference.assembly,
      loc: locOf(region),
      tracks: lanes(graph, region),
    },
    {
      type: 'GraphGenomeView',
      displayName: tier ? `${label} graph (bubble tier)` : `${label} graph`,
      loadedTrackId: tier ?? graph.segmentsTrackId,
      loadedRegion: {
        refName: region.chrom,
        assemblyName: dataset.reference.assembly,
        start: region.start,
        end: region.end,
      },
      connectedViewId: LGV_ID,
      colorScheme: 'reference-position',
      ...(tier
        ? { maxRegionBp: region.end - region.start, layoutMode: 'auto' }
        : {}),
    },
  ])
}

// A catalog locus as the graph. Undefined only when the graph is known to
// collapse the locus (`graphCollapsed`): minigraph merges near-identical
// segmental duplications onto one path, so a launch there opens a bare thread
// and reads as an empty result rather than as a collapsed one.
//
// A wide locus is no longer excluded — it draws its coarse tier. That is what
// makes every card in a derived catalogue openable, which half of both of them
// were not: 10 of mouse's 20 entries and 12 of cattle's are multi-megabase
// clusters with no detail window.
export function graphLocusUrl(
  dataset: PangenomeDataset,
  locus: PangenomeLocus,
) {
  return locus.graphCollapsed
    ? undefined
    : graphRegionUrl(dataset, launchRegion(locus))
}

// The tutorial's eight lanes and the reference draw legibly in 460 px.
const LANE_HEIGHT_PX = 51
const GENE_ROW_HEIGHT_PX = 60

// A locus's haplotypes as lanes read from the graph: the dataset's panel for
// it, one lane per structural configuration, commonest first. `laneFilter`
// decides which walks are fetched and drawn and `domain` pins their order, so
// the config's one lane track serves every locus; the track's own assemblies
// are only what a host that drops the props would open instead.
//
// Undefined without the lane track or a panel: a locus where nothing tells the
// haplotypes apart has no forms to choose between.
export function haplotypeLanesUrl(
  dataset: PangenomeDataset,
  locus: PangenomeLocus,
) {
  const panel = dataset.panels?.[locus.id]
  return panel
    ? haplotypeLanesForRegion(
        dataset,
        launchRegion(locus),
        panel.lanes.map(l => l.haplotype),
      )
    : undefined
}

// The same launch over any window, for a region a reader asked for rather than
// a locus the table lists. Undefined without the lane track or without
// haplotypes to draw.
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
          laneFilter: { only: haplotypes },
          domain: haplotypes,
          height: LANE_HEIGHT_PX * (haplotypes.length + 1),
        },
      ],
    },
  ])
}

// Internal cross-link into the gene hub for the locus's marker gene, seeded
// from the reference species' taxon (not a JBrowse spec — a site route).
// Undefined where the locus names no gene: a derived entry over an intergenic
// bubble has none, and a hub link built from its coordinate label would be a
// button that always comes back empty.
export function geneHubUrl(dataset: PangenomeDataset, locus: PangenomeLocus) {
  const gene = syntenyGene(locus)
  return gene
    ? `/gene/?gene=${encodeURIComponent(gene)}&ref=${dataset.reference.taxonId}`
    : undefined
}
