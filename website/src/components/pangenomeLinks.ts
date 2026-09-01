// JBrowse launch-URL builders for the pangenome explorer. Every graph/reference
// specific value comes from the PangenomeDataset, so these builders are
// graph-agnostic. The graph VCF usually isn't in the hosted reference config, so
// we attach it inline via `sessionTracks` (see specUrl) pointing at the public,
// CORS-open VCF — the launch works without first baking the track into the config.

import { HOST_HAS_MULTISAMPLE_VARIANT_DISPLAY } from '../config/jbrowse.ts'
import { panelTracks, specUrl, syntenyViewUrl } from './jbrowseLinks.ts'
import { detailWindow, locusRegion, syntenyGene } from './pangenomeLoci.ts'

import type { PangenomeDataset } from './pangenomeDataset.ts'
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
// of this callset use. Do not carry the reasoning over to a count, though —
// `generatePangenomeData.ts` explains at length why LV>0 records here are real
// variants rather than duplicates of a parent record, and filtering them out of
// a summary deletes data (over SMN it would leave 1 site of 11,553).
//
// Know what the LV half costs on the lane, too, because it is not free and the
// worst case is our headline locus. LV=0 and LV>0 records in this file are
// spatially DISJOINT, so filtering does not thin a region — it blanks the
// regions that are nested. Measured over the MHC detail window
// (chr6:32,510,000-32,600,000) on 2026-08-06: of 182 records with a >=50 bp
// allele, 160 survive and 22 are dropped, and all 2,688 nested records in that
// window fall in one 22 kb stretch, 32,570,542-32,592,610. That stretch is
// HLA-DRB1 (32,578,775-32,589,848), whose SV tier is 4 records, all nested — so
// the filter renders DRB1 empty, in a window widened specifically to reach it
// (see the `mhc-hla` detailWindow comment). Kept anyway, to stay the tutorial's
// filter verbatim; drop the LV half if the DRB1 hole matters more than that.
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
// — which is the only form co-inherited blocks are visible in.
//
// Omitted entirely where the host lacks the display, because this declaration
// has no graceful degradation: see HOST_HAS_MULTISAMPLE_VARIANT_DISPLAY. Without
// it the launch still opens, on the single-row display.
function graphVcfTrack(dataset: PangenomeDataset) {
  return {
    type: 'VariantTrack',
    trackId: dataset.graphVcf.trackId,
    name: dataset.graphVcf.name,
    assemblyNames: [dataset.reference.assembly],
    adapter: { type: 'VcfTabixAdapter', uri: dataset.graphVcf.url },
    ...(HOST_HAS_MULTISAMPLE_VARIANT_DISPLAY
      ? {
          displays: [
            {
              type: 'LinearMultiSampleVariantDisplay',
              displayId: `${dataset.graphVcf.trackId}-multisample`,
              renderingMode: 'phased',
              jexlFilters: SV_FILTER,
              height: 340,
            },
          ],
        }
      : {}),
  }
}

// Reference LinearGenomeView open at `loc`: reference genes, the graph VCF
// (inlined) as a haplotype matrix, and the dataset's structural-variation
// tracks.
function referenceLgvUrl(dataset: PangenomeDataset, loc: string) {
  return specUrl(
    dataset.reference.configUrl,
    [
      {
        type: 'LinearGenomeView',
        assembly: dataset.reference.assembly,
        loc,
        tracks: [
          dataset.reference.geneTrackId,
          dataset.graphVcf.trackId,
          ...dataset.svTrackIds,
        ],
      },
    ],
    [graphVcfTrack(dataset)],
  )
}

// Whole-graph entry point: lands on the dataset's landing region.
export function graphBrowserUrl(dataset: PangenomeDataset) {
  return referenceLgvUrl(dataset, dataset.landingRegion)
}

// The graph variants (plus SV tracks) open at a specific catalog locus.
//
// The window is the locus's detail window, not its display span. The callset is
// fetched per view and runs ~200 bytes/bp of VCF text over these loci, so a
// multi-Mb span (MHC's is 4.97 Mb, holding 109,988 records) opens the lane
// behind the "too much data" banner — the button's own subject, undrawn. Every
// window the tutorial draws this callset on is 70–130 kb.
export function graphVcfLgvUrl(
  dataset: PangenomeDataset,
  locus: PangenomeLocus,
) {
  const window = detailWindow(locus)
  return referenceLgvUrl(
    dataset,
    window
      ? `${locus.chrom}:${window.start}-${window.end}`
      : locusRegion(locus),
  )
}

// A region drawn as the graph itself, under a linear view of the same window.
// `loadedTrackId`/`loadedRegion` are plain persisted view props, so the graph
// opens on the region directly rather than the user rubberbanding to it; the
// shared `id`/`connectedViewId` pairs the two panels for hover sync.
//
// `colorScheme` is the one thing that ties the two panels together under the
// default force layout, which has no axis to share: the ramp runs red at the
// start of the loaded window to magenta at its end, and a segment with no
// reference coordinate comes off the ramp as charcoal. The alleles lane beside
// it states each allele's size against the reference span it replaces.
//
// Undefined when the dataset has no hosted graph. Width is the caller's
// concern: `graphLocusUrl` applies the catalog's rules, and the HPRC page's
// region form applies `MAX_GRAPH_REGION_BP`.
export interface GraphRegion {
  chrom: string
  start: number
  end: number
  label: string
}

export function graphRegionUrl(dataset: PangenomeDataset, region: GraphRegion) {
  const graph = dataset.graphBrowser
  return graph
    ? specUrl(graph.configUrl, [
        {
          type: 'LinearGenomeView',
          id: LGV_ID,
          assembly: dataset.reference.assembly,
          // Bare digits: this runs in the visitor's browser, and JBrowse's
          // locstring parser strips commas only, so a locale that groups with
          // '.' or a space (de-DE, fr-FR, ru-RU) would produce a region no view
          // can navigate to.
          loc: `${region.chrom}:${region.start}-${region.end}`,
          tracks: [
            graph.geneTrackId,
            graph.bubblesTrackId,
            graph.segmentsTrackId,
            ...(graph.allelesTrackId ? [graph.allelesTrackId] : []),
          ],
        },
        {
          type: 'GraphGenomeView',
          displayName: `${region.label} graph`,
          loadedTrackId: graph.segmentsTrackId,
          loadedRegion: {
            refName: region.chrom,
            assemblyName: dataset.reference.assembly,
            start: region.start,
            end: region.end,
          },
          connectedViewId: LGV_ID,
          colorScheme: 'reference-position',
        },
      ])
    : undefined
}

// A whole chromosome drawn from the bubble tier: one node per top-level
// bubble, so 249 Mb is a few hundred nodes and lays out in milliseconds. The
// linear view above it gets the tier, the variability curve and genes rather
// than the segment-level lanes, which would draw nothing useful at this width.
//
// `maxRegionBp` is the one setting that has to move: the view refuses a cut
// over 5 Mb as a proxy for node count, and a tier breaks the proxy.
// `maxGraphNodes` stays as the real ceiling.
//
// Undefined when the dataset has no tier, or no such chromosome.
export function graphChromosomeUrl(dataset: PangenomeDataset, chrom: string) {
  const graph = dataset.graphBrowser
  const entry = graph?.chromosomes?.find(c => c.name === chrom)
  if (!graph?.tierTrackId || !entry) {
    return undefined
  }
  return specUrl(graph.configUrl, [
    {
      type: 'LinearGenomeView',
      id: LGV_ID,
      assembly: dataset.reference.assembly,
      loc: `${chrom}:1-${entry.length}`,
      tracks: [
        graph.geneTrackId,
        ...(graph.bubbleScoreTrackId ? [graph.bubbleScoreTrackId] : []),
        graph.tierTrackId,
      ],
    },
    {
      type: 'GraphGenomeView',
      displayName: `${chrom} graph (bubble tier)`,
      loadedTrackId: graph.tierTrackId,
      loadedRegion: {
        refName: chrom,
        assemblyName: dataset.reference.assembly,
        start: 0,
        end: entry.length,
      },
      maxRegionBp: entry.length,
      connectedViewId: LGV_ID,
      colorScheme: 'reference-position',
      // Anchored: every x is a reference coordinate, so the backbone runs left
      // to right under the linear view instead of bending into the arc the
      // force layout makes of a few hundred nodes in a chain.
      layoutMode: 'auto',
    },
  ])
}

// The same region in the dataset's external graph browser, which navigates by
// a `#chrom:start-end` hash (1-based, like a typed locstring). Undefined when
// the dataset names none.
export function externalGraphUrl(
  dataset: PangenomeDataset,
  region: Omit<GraphRegion, 'label'>,
) {
  const ext = dataset.externalGraphBrowser
  return ext
    ? `${ext.baseUrl}#${region.chrom}:${region.start + 1}-${region.end}`
    : undefined
}

// A catalog locus as the graph. Undefined when the locus is too wide to draw as
// one graph and has picked no narrower window, or when the graph is known to
// collapse the locus (`graphCollapsed`).
export function graphLocusUrl(
  dataset: PangenomeDataset,
  locus: PangenomeLocus,
) {
  const window = detailWindow(locus)
  return window && !locus.graphCollapsed
    ? graphRegionUrl(dataset, {
        ...window,
        chrom: locus.chrom,
        label: locus.gene,
      })
    : undefined
}

// Internal cross-link into the conserved-gene-order view for the locus's marker
// gene, seeded from the reference species' taxon (not a JBrowse spec — a site
// route). That page redirects home unless `features.multiSynteny`, so render
// this only under the same flag.
export function crossSpeciesGeneOrderUrl(
  dataset: PangenomeDataset,
  locus: PangenomeLocus,
) {
  return `/conserved-gene-order?gene=${encodeURIComponent(syntenyGene(locus))}&ref=${dataset.reference.taxonId}`
}

// Pairwise reference ↔ synteny-target view at the locus (reference-level
// divergence), through the shared synteny builder so it gets the site's view
// defaults and opens the reference panel on its gene track rather than empty.
// Undefined when the dataset defines no synteny target.
export function referenceSyntenyUrl(
  dataset: PangenomeDataset,
  locus: PangenomeLocus,
) {
  const target = dataset.syntenyTarget
  return target
    ? syntenyViewUrl(
        [
          {
            assembly: dataset.reference.assembly,
            loc: locusRegion(locus),
            ...panelTracks(dataset.reference.geneTrackId),
          },
          { assembly: target.assembly },
        ],
        [target.trackId],
        { colorBy: 'query', drawCurves: true, autoDiagonalize: true },
      )
    : undefined
}
