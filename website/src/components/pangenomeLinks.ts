// JBrowse launch urls for the /pangenomes pages, built from a PangenomeDataset
// and a region.

import { specUrl } from './jbrowseLinks.ts'
import { MAX_DETAIL_WINDOW_BP } from './pangenomeLoci.ts'

import type {
  PangenomeDataset,
  PangenomeGraphBrowser,
} from './pangenomeDataset.ts'

// 0-based half-open. `label` names the graph view.
export interface GraphRegion {
  chrom: string
  start: number
  end: number
  label?: string
}

// The HPRC tutorial's structural filter. A span filter would keep only
// deletions, since an insertion consumes no reference. No `INFO.LV[0]==0`:
// where a parent snarl has no record (vcfwave's HLA-DRB5 and HP) it blanks the
// region, and where it has one (bovine DEFB) it keeps a single locus-wide
// record with a different allele per haplotype.
const SV_FILTER = ['jexl:alleleLength(feature)>=50']

// The callset as an inline session track, since the reference config does not
// carry it.
//
// The matrix display is declared in the track's `displays[]`, not as display
// props on the view's `tracks` entry: hosted builds ignore the second form and
// open the default single-row LinearVariantDisplay behind "too much data",
// silently (measured against `latest`).
//
// `phased` splits each sample into its haplotypes, and is asked for only where
// the genotypes are phased: over a `vg deconstruct` callset of haploid assembly
// columns it draws every second row empty.
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

// A region is 0-based half-open and a locstring 1-based. Bare digits, not
// toLocaleString: this runs in the visitor's browser, and JBrowse's locstring
// parser strips commas only, so a locale that groups with '.' or a space would
// produce a region no view can navigate to.
const locOf = (region: GraphRegion) =>
  `${region.chrom}:${region.start + 1}-${region.end}`

const isWide = (region: GraphRegion) =>
  region.end - region.start > MAX_DETAIL_WINDOW_BP

// An rGFA track opens as the graph, its first display, so a lane over one
// names the linear display.
const linearLane = (trackId: string) => ({
  trackId,
  type: 'LinearBasicDisplay',
})

// The one rule for how a window of the graph is drawn. Up to
// MAX_DETAIL_WINDOW_BP the segment-level lanes are legible: bubbles, alleles at
// their real size, segments. Past it the segments track refuses with "Too many
// features" and the allele inventory passes its fetch limit, so a wide window
// gets the coarse tier and the segments-per-bubble curve. A whole chromosome is
// the widest region and takes the same branch.
//
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
  const [detail, rgfa] = isWide(region)
    ? [[graph.bubbleScoreTrackId], graph.tierTrackId]
    : [[graph.bubblesTrackId, graph.allelesTrackId], graph.segmentsTrackId]
  return [
    graph.geneTrackId,
    ...detail,
    ...(overGraph ? [] : [linearLane(rgfa)]),
    ...(graph.rearrangementTrack ? [graph.rearrangementTrack] : []),
  ]
}

// The graph's own linear lanes, out of the graph config. For a dataset with no
// callset these are the pangenome view of a region.
export function graphLanesUrl(dataset: PangenomeDataset, region: GraphRegion) {
  const graph = dataset.graphBrowser
  return specUrl(graph.configUrl, [
    {
      type: 'LinearGenomeView',
      assembly: dataset.reference.assembly,
      loc: locOf(region),
      tracks: lanes(graph, region),
    },
  ])
}

// Reference genes, the callset as a haplotype matrix, and the dataset's
// structural-variation tracks. Undefined where the dataset has no callset.
export function referenceRegionUrl(
  dataset: PangenomeDataset,
  region: GraphRegion,
) {
  const vcfTrack = graphVcfTrack(dataset)
  return vcfTrack
    ? specUrl(
        dataset.reference.configUrl,
        [
          {
            type: 'LinearGenomeView',
            assembly: dataset.reference.assembly,
            loc: locOf(region),
            tracks: [
              dataset.reference.geneTrackId,
              vcfTrack.trackId,
              ...(dataset.svTrackIds ?? []),
            ],
          },
        ],
        [vcfTrack],
      )
    : undefined
}

// A region drawn as the graph: one linear view, its lanes above the segments
// track opened as the graph. The configs open it force-directed, so the launch
// names no layout.
export function graphRegionUrl(dataset: PangenomeDataset, region: GraphRegion) {
  const graph = dataset.graphBrowser
  return specUrl(graph.configUrl, [
    {
      type: 'LinearGenomeView',
      displayName: `${region.label ?? locOf(region)} graph`,
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
// config's one lane track serves every window.
//
// Undefined without the lane track or without haplotypes to draw.
export function haplotypeLanesForRegion(
  dataset: PangenomeDataset,
  region: GraphRegion,
  haplotypes: string[],
) {
  const graph = dataset.graphBrowser
  const trackId = graph.haplotypeLanesTrackId
  if (!trackId || haplotypes.length === 0) {
    return undefined
  }
  return specUrl(graph.configUrl, [
    {
      type: 'LinearGenomeView',
      assembly: dataset.reference.assembly,
      loc: locOf(region),
      tracks: [
        // The reference lane draws these genes too, but unnamed.
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

// The same haplotypes cut out of the graph in BandageJS. The layout is always
// named, since BandageJS otherwise opens in whichever one the visitor last
// picked, and so are the haplotypes, since without them it cuts all 464.
//
// Not walk rows, which cut whole snarls: measured 2026-10-04, that passes
// BandageJS's 100,000-node limit on SMN, DEFB and HP, while the window alone is
// 1,315–33,010 nodes.
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

export interface LaunchLink {
  kind: 'graph' | 'variants' | 'bubbles' | 'haplotypes' | 'bandage'
  label: string
  about: string
  url: string
}

// Whether a window falls on a locus minigraph collapses, for an example and a
// typed gene alike. A wide window is left alone: a chromosome that holds such a
// locus still draws from its tier.
const graphCollapsed = (dataset: PangenomeDataset, region: GraphRegion) =>
  !isWide(region) &&
  dataset.loci.some(
    l =>
      l.graphCollapsed &&
      l.chrom === region.chrom &&
      l.start < region.end &&
      region.start < l.end,
  )

// What a region opens as, in one order. The callset has no coarse tier, so a
// wide window offers no variants launch, where the graph's own lanes switch to
// the tier and stay.
export function regionLaunches(
  dataset: PangenomeDataset,
  region: GraphRegion,
  haplotypes: string[] = [],
): LaunchLink[] {
  const links: (Omit<LaunchLink, 'url'> & { url: string | undefined })[] = [
    {
      kind: 'graph',
      label: 'Graph',
      about: 'the region drawn as a graph',
      url: graphCollapsed(dataset, region)
        ? undefined
        : graphRegionUrl(dataset, region),
    },
    dataset.graphVcf
      ? {
          kind: 'variants',
          label: 'Variants',
          about: 'the structural variants each haplotype carries',
          url: isWide(region) ? undefined : referenceRegionUrl(dataset, region),
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
