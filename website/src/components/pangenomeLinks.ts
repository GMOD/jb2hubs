// JBrowse launch-URL builders for the pangenome explorer. Every graph/reference
// specific value comes from the PangenomeDataset, so these builders are
// graph-agnostic. The graph VCF usually isn't in the hosted reference config, so
// we attach it inline via `sessionTracks` (see specUrl) pointing at the public,
// CORS-open VCF — the launch works without first baking the track into the config.

import { mergeConfig, specUrl } from './jbrowseLinks.ts'
import { locusRegion, syntenyGene } from './pangenomeLoci.ts'

import type { PangenomeDataset } from './pangenomeDataset.ts'
import type { PangenomeLocus } from './pangenomeLoci.ts'

// The graph VCF as an inline session track (public, CORS-open, tabix-indexed).
function graphVcfTrack(dataset: PangenomeDataset) {
  return {
    type: 'VariantTrack',
    trackId: dataset.graphVcf.trackId,
    name: dataset.graphVcf.name,
    assemblyNames: [dataset.reference.assembly],
    adapter: { type: 'VcfTabixAdapter', uri: dataset.graphVcf.url },
  }
}

// Reference LinearGenomeView open at `loc`: reference genes, the graph VCF
// (inlined), and the dataset's structural-variation tracks.
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
export function graphVcfLgvUrl(
  dataset: PangenomeDataset,
  locus: PangenomeLocus,
) {
  return referenceLgvUrl(dataset, locusRegion(locus))
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
