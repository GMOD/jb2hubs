// JBrowse launch urls for the /pangenomes pages, built from a PangenomeDataset
// and a region.

import { specUrl } from './jbrowseLinks.ts'
import { catalogRows } from './pangenomeCatalogs.ts'
import { knownAllelesTrack } from './pangenomeKnownAlleles.ts'
import { isWide } from './pangenomeLoci.ts'
import { rowOrder } from './rowOrder.ts'

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
// record with a different allele per haplotype. Without it HP's 1.7 kb
// deletion is in wave.vcf.gz with its 190 carriers (measured 2026-10-09).
//
// A predicate list, as `main` reads `filter` since jbrowse-components 65b07ee3
// (ADR-240): the `{ expressions }` object it replaced fails the whole track
// with "Value is not an array".
const SV_FILTER = ['jexl:alleleLength(feature)>=50']

// The matrix rows a window's structural forms ask for, in PanSN: `order`
// groups the haplotypes by form commonest first, so the matrix reads as one
// block per form in the order the page's table lists them, and `omitted` are
// those with no call at any site in the window, which have no lane either:
// on chrX, each male's first haplotype. The release's pgbi.vcf.gz wrote a
// male's one X as both alleles there, so his X drew twice until they went.
export interface MatrixRows {
  order: string[]
  omitted: string[]
}

// A phased row is `<sample> HP<n>`, numbered from 0, and sidecar haplotype
// `#1` is HP0: at CFHR the 138 carriers of the 85 kb deletion are the same set
// both ways, in wave.vcf.gz and pgbi.vcf.gz (measured 2026-10-09).
const matrixRowName = (haplotype: string) => {
  const [sample, hap] = haplotype.split('#')
  return `${sample} HP${Number(hap) - 1}`
}

// The callset as an inline session track. The reference config does not carry
// it, and the graph configs' callset tracks lack the structural filter, the
// lane and the window's row order.
//
// - `phased` splits each sample into haplotypes, and is asked for only where
//   the genotypes are phased; over haploid assembly columns it draws every
//   second row empty.
// - An insertion draws at its one reference base; widened, an 18 kb insertion
//   read as a block of sequence the haplotype lacks.
// - The cells take the display's `svType` preset, and the lane above the rows
//   draws each record once.
function graphVcfTrack(dataset: PangenomeDataset, matrixRows?: MatrixRows) {
  const vcf = dataset.graphVcf
  const order = matrixRows?.order.map(matrixRowName) ?? []
  const rows =
    vcf?.phased && order.length > 0
      ? {
          ...rowOrder(order),
          ...(matrixRows?.omitted.length ? { kept: order } : {}),
        }
      : vcf?.rows
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
            ...(vcf.phased ? { unit: 'haplotype' } : {}),
            filter: SV_FILTER,
            height: MATRIX_HEIGHT_PX + VARIANT_LANE_HEIGHT_PX,
            ...(rows ? { rows } : {}),
            showInsertionGlyphs: false,
            variants: {
              show: true,
              height: VARIANT_LANE_HEIGHT_PX,
              showLabels: 'none',
            },
            encoding: { color: { field: 'svType' } },
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

// An rGFA track opens as the graph, its first display, so a lane over one
// names the linear display.
const linearLane = (trackId: string) => ({
  trackId,
  type: 'LinearBasicDisplay',
})

// Past this a gene lane is a "Too many features" banner on most chromosomes
// (58 of 78 whole-chromosome launches, measured 2026-10-08), and the graph
// labels its own genes at that zoom.
const MAX_GENE_LANE_BP = 10_000_000

// The one rule for how a window of the graph is drawn. Up to
// MAX_DETAIL_WINDOW_BP the segment-level lanes are legible: bubbles and
// segments. Past it the segments track refuses with "Too many features", so a
// wide window gets the coarse tier and the segments-per-bubble curve. A whole
// chromosome is the widest region and takes the same branch.
//
// No allele lane. The allele inventory, an AlignmentsTrack of one row per
// allele, says nothing about who carries what; where a callset exists its
// matrix does, and the graph launch opens that instead.
function lanes(graph: PangenomeGraphBrowser, region: GraphRegion) {
  const [detail, rgfa] = isWide(region)
    ? [[graph.bubbleScoreTrackId], graph.tierTrackId]
    : [[graph.bubblesTrackId], graph.segmentsTrackId]
  return {
    genes: region.end - region.start <= MAX_GENE_LANE_BP,
    detail,
    rgfa,
    rearrangements: graph.rearrangementTrack ? [graph.rearrangementTrack] : [],
  }
}

// The graph's own linear lanes, out of the graph config. For a dataset with no
// callset these are the pangenome view of a region.
export function graphLanesUrl(dataset: PangenomeDataset, region: GraphRegion) {
  const graph = dataset.graphBrowser
  const { genes, detail, rgfa, rearrangements } = lanes(graph, region)
  const annotations = annotationRows(dataset, region)
  return specUrl(
    graph.configUrl,
    [
      {
        type: 'LinearGenomeView',
        assembly: dataset.reference.assembly,
        loc: locOf(region),
        tracks: [
          ...(genes ? [graph.geneTrackId] : []),
          ...annotations.tracks,
          ...detail,
          linearLane(rgfa),
          ...rearrangements,
        ],
      },
    ],
    annotations.sessionTracks,
  )
}

// Reference genes, the callset as a haplotype matrix, and the dataset's
// structural-variation tracks. Undefined where the dataset has no callset.
export function referenceRegionUrl(
  dataset: PangenomeDataset,
  region: GraphRegion,
  matrixRows?: MatrixRows,
) {
  const vcfTrack = graphVcfTrack(dataset, matrixRows)
  const annotations = annotationRows(dataset, region)
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
              ...annotations.tracks,
              vcfTrack.trackId,
              ...(dataset.svTrackIds ?? []),
            ],
          },
        ],
        [...annotations.sessionTracks, vcfTrack],
      )
    : undefined
}

// One compact row of gene models, so what a launch is about starts near the
// top of the window.
const GENE_ROW_HEIGHT_PX = 60
const geneRow = (graph: PangenomeGraphBrowser) => ({
  trackId: graph.geneTrackId,
  type: 'LinearBasicDisplay',
  geneGlyphMode: 'longestCoding',
  displayMode: 'compact',
  height: GENE_ROW_HEIGHT_PX,
})

// The known alleles in a window and the catalogs over it, as rows under its
// genes, and the session tracks that define them.
const ALLELE_ROW_HEIGHT_PX = 50
function annotationRows(dataset: PangenomeDataset, region: GraphRegion) {
  const alleles = knownAllelesTrack(dataset, region)
  const catalogs = catalogRows(dataset, region)
  return {
    tracks: [
      ...(alleles
        ? [
            {
              trackId: alleles.trackId,
              type: 'LinearBasicDisplay',
              height: ALLELE_ROW_HEIGHT_PX,
            },
          ]
        : []),
      ...catalogs.tracks,
    ],
    sessionTracks: [...(alleles ? [alleles] : []), ...catalogs.sessionTracks],
  }
}

const GRAPH_HEIGHT_PX = 420
// With the matrix under it, the graph gives up a strip of its legend margin so
// both fit the page's frame.
const GRAPH_OVER_MATRIX_HEIGHT_PX = 320
const MATRIX_HEIGHT_PX = 300
// Marks only: a record's ID is its graph path (`>8460211>8460213…`), and its
// description a list of allele lengths. The lane's height comes out of the
// display's.
export const VARIANT_LANE_HEIGHT_PX = 24

// A region drawn as the graph: one linear view, the graph under a row of genes
// and the lanes under the graph. With the lanes first the graph started 732 px
// down a 900 px window, and 1,415 px down under Arabidopsis's SyRI rows
// (measured 2026-10-08).
//
// No segments or tier lane opens. The segments lane is the graph track itself,
// and a view shows a track once. The graph cuts its own tier past the adapter's
// `coarse.aboveBpPerPx`, which turns on the view's width, so a tier lane
// switched by span would disagree with it: at 1000 px, HPRC's graph stays fine
// up to ~1 Mb, and Arabidopsis's goes coarse at ~117 kb.
//
// The callset's matrix sits directly under the graph where the window can
// draw it, in place of the bubbles lane: the graph draws each bubble, and the
// matrix says who takes which side. Both graph configs that have a callset
// define the reference assembly with its chromAlias, so the VCF's names
// resolve there too.
//
// The configs open the graph force-directed, so the launch names no layout.
export function graphRegionUrl(
  dataset: PangenomeDataset,
  region: GraphRegion,
  matrixRows?: MatrixRows,
  withCallset = drawsCallset(dataset, region),
) {
  const graph = dataset.graphBrowser
  const { genes, detail, rearrangements } = lanes(graph, region)
  const vcfTrack = withCallset ? graphVcfTrack(dataset, matrixRows) : undefined
  const annotations = annotationRows(dataset, region)
  return specUrl(
    graph.configUrl,
    [
      {
        type: 'LinearGenomeView',
        displayName: `${region.label ?? locOf(region)} graph`,
        assembly: dataset.reference.assembly,
        loc: locOf(region),
        tracks: [
          ...(genes ? [geneRow(graph)] : []),
          ...annotations.tracks,
          {
            trackId: graph.segmentsTrackId,
            type: 'LinearGraphDisplay',
            height: vcfTrack ? GRAPH_OVER_MATRIX_HEIGHT_PX : GRAPH_HEIGHT_PX,
          },
          ...(vcfTrack ? [vcfTrack.trackId] : detail),
          ...rearrangements,
        ],
      },
    ],
    [...annotations.sessionTracks, ...(vcfTrack ? [vcfTrack] : [])],
  )
}

// A lane, its name line and the gene names under it.
const LANE_HEIGHT_PX = 40

// A window's haplotypes as lanes read from the graph. `rows.kept` decides which
// walks are fetched and drawn, so the config's one lane track serves every
// window, and the display stacks them by structure, below `first` where one is
// named. `rows.labels` names each by its PanSN prefix, since every lane is HPRC
// release 2.
//
// Undefined without the lane track or without haplotypes to draw.
export function haplotypeLanesForRegion(
  dataset: PangenomeDataset,
  region: GraphRegion,
  haplotypes: string[],
  first?: string,
) {
  const graph = dataset.graphBrowser
  const trackId = graph.haplotypeLanesTrackId
  if (!trackId || haplotypes.length === 0) {
    return undefined
  }
  const annotations = annotationRows(dataset, region)
  return specUrl(
    graph.configUrl,
    [
      {
        type: 'LinearGenomeView',
        assembly: dataset.reference.assembly,
        loc: locOf(region),
        tracks: [
          // The reference lane draws these genes too, but unnamed.
          geneRow(graph),
          ...annotations.tracks,
          {
            trackId,
            type: 'MultiWaySyntenyDisplay',
            rows: {
              kept: haplotypes,
              labels: Object.fromEntries(haplotypes.map(h => [h, h])),
              ...(first ? rowOrder([first]) : {}),
            },
            height: LANE_HEIGHT_PX * (haplotypes.length + 1),
          },
        ],
      },
    ],
    annotations.sessionTracks,
  )
}

const BANDAGE_URL = 'https://jbrowse.org/demos/bandagejs/'

// The same haplotypes cut out of the graph's walk file in BandageJS. The
// layout is always named, since BandageJS otherwise opens in whichever one the
// visitor last picked, and so are the haplotypes, since without them it cuts
// all 464.
//
// `maxNodes` is the count past which BandageJS asks before drawing, 20,000
// unless named. Two examples pass that and opened on the question: MHC class II
// cuts 33,010 nodes and draws in 14 s, KIR 23,021 in 7 s (measured 2026-10-08).
//
// Undefined without a walk file or without haplotypes to draw.
export function bandageRegionUrl(
  dataset: PangenomeDataset,
  region: GraphRegion,
  haplotypes: string[],
) {
  if (!dataset.walksUrl || haplotypes.length === 0) {
    return undefined
  }
  const query = new URLSearchParams({
    walks: dataset.walksUrl,
    loc: locOf(region),
    haps: haplotypes.join(','),
    layout: 'force',
    maxNodes: '40000',
  })
  return `${BANDAGE_URL}?${query}`
}

export interface LaunchLink {
  kind: 'graph' | 'variants' | 'bubbles' | 'haplotypes' | 'bandage'
  label: string
  about: string
  url: string
}

// Whether a window falls on a curated locus flagged as having nothing to show
// in one launch, for an example and a typed gene alike. A wide window is left
// alone unless the locus holds all of it: a chromosome that holds such a locus
// still draws from its tier.
const onFlaggedLocus = (
  dataset: PangenomeDataset,
  region: GraphRegion,
  flag: 'graphCollapsed' | 'callsetBlank',
) =>
  dataset.loci.some(
    l =>
      l[flag] &&
      l.chrom === region.chrom &&
      (isWide(region)
        ? l.start <= region.start && region.end <= l.end
        : l.start < region.end && region.start < l.end),
  )

// The callset has no coarse tier, so a wide window draws no matrix, where the
// graph's own lanes switch to the tier and stay.
export const drawsCallset = (dataset: PangenomeDataset, region: GraphRegion) =>
  !!dataset.graphVcf &&
  !isWide(region) &&
  !onFlaggedLocus(dataset, region, 'callsetBlank')

// What a region opens as, in one order.
//
// `haplotypes` stand one per form for the graph cuts, `laneHaplotypes` are the
// Haplotypes launch's lanes, and `matrixRows` every haplotype grouped by form,
// which orders the matrix.
export function regionLaunches(
  dataset: PangenomeDataset,
  region: GraphRegion,
  haplotypes: string[] = [],
  matrixRows?: MatrixRows,
  laneHaplotypes: string[] = haplotypes,
): LaunchLink[] {
  const grouped =
    matrixRows && haplotypes.length > 0 && dataset.graphVcf?.phased
      ? ', one row per haplotype, grouped by the forms listed below'
      : ''
  const callset = drawsCallset(dataset, region)
  const links: (Omit<LaunchLink, 'url'> & { url: string | undefined })[] = [
    {
      kind: 'graph',
      label: 'Graph',
      about: callset
        ? `The region drawn as a graph, and under it the structural variants each haplotype carries${grouped}.`
        : 'The region drawn as a graph.',
      url: onFlaggedLocus(dataset, region, 'graphCollapsed')
        ? undefined
        : graphRegionUrl(dataset, region, matrixRows, callset),
    },
    dataset.graphVcf
      ? {
          kind: 'variants',
          label: 'Variants',
          about: `The structural variants each haplotype carries${grouped}, over the reference's genes.`,
          url: callset
            ? referenceRegionUrl(dataset, region, matrixRows)
            : undefined,
        }
      : {
          kind: 'bubbles',
          label: 'Bubbles',
          about: 'Where the graph branches, as tracks on the reference.',
          url: graphLanesUrl(dataset, region),
        },
    {
      kind: 'haplotypes',
      label: 'Haplotypes',
      about:
        'Haplotypes in proportion to how many carry each structural form, alike ones stacked together, each drawn as its own sequence.',
      url: haplotypeLanesForRegion(dataset, region, laneHaplotypes),
    },
    {
      kind: 'bandage',
      label: 'BandageJS',
      about:
        'The same haplotypes cut out of the graph, laid out as Bandage draws them.',
      url: bandageRegionUrl(dataset, region, haplotypes),
    },
  ]
  return links.flatMap(l => (l.url ? [{ ...l, url: l.url }] : []))
}
