// JBrowse launch-URL builders for the pangenome explorer. Every graph/reference
// specific value comes from the PangenomeDataset, so these builders are
// graph-agnostic. The graph VCF usually isn't in the hosted reference config, so
// we attach it inline via `sessionTracks` (see specUrl) pointing at the public,
// CORS-open VCF — the launch works without first baking the track into the config.

import { HOST_HAS_MULTISAMPLE_VARIANT_DISPLAY } from '../config/jbrowse.ts'
import { mergeConfig, specUrl } from './jbrowseLinks.ts'
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

// The locus drawn as the graph itself, under a linear view of the same window.
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
// Undefined when the dataset has no hosted graph, when the locus is too wide to
// draw as one graph and has picked no narrower window, or when the graph is
// known to collapse the locus (`graphCollapsed`).
export function graphLocusUrl(
  dataset: PangenomeDataset,
  locus: PangenomeLocus,
) {
  const graph = dataset.graphBrowser
  const window = detailWindow(locus)
  return graph && window && !locus.graphCollapsed
    ? specUrl(graph.configUrl, [
        {
          type: 'LinearGenomeView',
          id: LGV_ID,
          assembly: dataset.reference.assembly,
          // Bare digits: this runs in the visitor's browser, and JBrowse's
          // locstring parser strips commas only, so a locale that groups with
          // '.' or a space (de-DE, fr-FR, ru-RU) would produce a region no view
          // can navigate to.
          loc: `${locus.chrom}:${window.start}-${window.end}`,
          tracks: [
            graph.geneTrackId,
            graph.bubblesTrackId,
            graph.segmentsTrackId,
            ...(graph.allelesTrackId ? [graph.allelesTrackId] : []),
          ],
        },
        {
          type: 'GraphGenomeView',
          displayName: `${locus.gene} graph`,
          loadedTrackId: graph.segmentsTrackId,
          loadedRegion: {
            refName: locus.chrom,
            assemblyName: dataset.reference.assembly,
            start: window.start,
            end: window.end,
          },
          connectedViewId: LGV_ID,
          colorScheme: 'reference-position',
        },
      ])
    : undefined
}

// Internal cross-link into the conserved-gene-order view for the locus's marker
// gene, seeded from the reference species' taxon (not a JBrowse spec — a site
// route).
export function crossSpeciesGeneOrderUrl(
  dataset: PangenomeDataset,
  locus: PangenomeLocus,
) {
  return `/conserved-gene-order?gene=${encodeURIComponent(syntenyGene(locus))}&ref=${dataset.reference.taxonId}`
}

// Pairwise reference ↔ synteny-target view at the locus (reference-level
// divergence). Undefined when the dataset defines no synteny target.
export function referenceSyntenyUrl(
  dataset: PangenomeDataset,
  locus: PangenomeLocus,
) {
  const target = dataset.syntenyTarget
  if (!target) {
    return undefined
  }
  return specUrl(mergeConfig([dataset.reference.assembly, target.assembly]), [
    {
      type: 'LinearSyntenyView',
      tracks: [target.trackId],
      views: [
        { assembly: dataset.reference.assembly, loc: locusRegion(locus) },
        { assembly: target.assembly },
      ],
      colorBy: 'query',
      drawCurves: true,
      autoDiagonalize: true,
    },
  ])
}
