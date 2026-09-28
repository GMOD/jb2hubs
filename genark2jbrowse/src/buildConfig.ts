import {
  dedupe,
  enhanceConfigObject,
  generateJBrowseConfigForAssemblyHub,
  multiwayStarTrack,
} from 'hubtools'

import type {
  ChainTrack,
  JBrowseConfig,
  NcbiGffAnnotation,
  StarGenome,
  Track,
} from 'hubtools'

// Everything a hub's config.json is a function of, gathered by the caller so
// this stays a pure transform: the whole config is assembled in memory and
// written once, in the order the steps used to run as separate read-modify-write
// passes (hub.txt -> NCBI GFF track + trix adapter + genetic codes -> extension
// tracks -> liftOver synteny tracks -> enhance). That order is what the
// published configs hold, so keep it unless a reorder is the point.
export interface HubBuildInput {
  accession: string
  hubFileText: string
  trackDbUrl: string
  // The sorted/bgzipped NCBI RefSeq GFF, by the basename it has inside the hub
  // dir, the per-sequence non-standard genetic codes derived from it
  // (deriveGeneticCodes.sh) in derivation order, and what its own header says
  // it is.
  gff?: {
    fileName: string
    geneticCodes: Record<string, number>
    annotation?: NcbiGffAnnotation
  }
  // trix/<accession>.ix exists from xenoSymbolIndex.sh; a hub with no GFF
  // searches it through the same adapter entry a GFF index gets.
  xenoSymbolIndex?: boolean
  // genArkExtensions/<accession>.json: its tracks come first and win on trackId,
  // and any other top-level key it carries overrides the generated one.
  extension?: JBrowseConfig
  chainTracks: (ChainTrack & Track)[]
}

export function ncbiGffTrack(
  accession: string,
  fileName: string,
  annotation?: NcbiGffAnnotation,
): Track {
  return {
    type: 'FeatureTrack',
    trackId: `${accession}-ncbiGff`,
    name: 'NCBI RefSeq - RefSeq All (GFF)',
    adapter: {
      type: 'Gff3TabixAdapter',
      gffGzLocation: { uri: fileName, locationType: 'UriLocation' },
      index: {
        location: { uri: `${fileName}.csi`, locationType: 'UriLocation' },
        indexType: 'CSI',
      },
    },
    category: ['Genes and Gene Predictions'],
    assemblyNames: [accession],
    ...(annotation ? { metadata: annotation } : {}),
  }
}

// The entry `jbrowse text-index --tracks` writes for an assembly, so textIndex.sh
// replacing it after indexing is a no-op on content.
export function trixAdapter(accession: string) {
  return {
    type: 'TrixTextSearchAdapter',
    textSearchAdapterId: `${accession}-index`,
    ixFilePath: { uri: `trix/${accession}.ix`, locationType: 'UriLocation' },
    ixxFilePath: { uri: `trix/${accession}.ixx`, locationType: 'UriLocation' },
    metaFilePath: {
      uri: `trix/${accession}_meta.json`,
      locationType: 'UriLocation',
    },
    assemblyNames: [accession],
  }
}

export function buildHubConfig({
  accession,
  hubFileText,
  trackDbUrl,
  gff,
  xenoSymbolIndex,
  extension,
  chainTracks,
}: HubBuildInput) {
  const config: JBrowseConfig = generateJBrowseConfigForAssemblyHub({
    hubFileText,
    trackDbUrl,
  })
  const tracks = config.tracks ?? []

  if (gff) {
    tracks.push(ncbiGffTrack(accession, gff.fileName, gff.annotation))
    config.aggregateTextSearchAdapters = [trixAdapter(accession)]
    const assembly = config.assemblies?.[0]
    if (
      Object.keys(gff.geneticCodes).length > 0 &&
      typeof assembly === 'object' &&
      assembly !== null
    ) {
      Object.assign(assembly, { geneticCodes: gff.geneticCodes })
    }
  } else if (
    xenoSymbolIndex &&
    tracks.some(t => t.trackId === `${accession}-xenoRefGene`)
  ) {
    config.aggregateTextSearchAdapters = [trixAdapter(accession)]
  }

  const withExtension: JBrowseConfig = extension
    ? {
        ...config,
        ...extension,
        tracks: dedupe(
          [
            ...(extension.tracks ?? []).map(t => ({
              ...t,
              trackId: `${accession}-${t.trackId}`,
            })),
            ...tracks,
          ],
          t => t.trackId,
        ),
      }
    : { ...config, tracks }

  const ids = new Set(withExtension.tracks?.map(t => t.trackId))
  withExtension.tracks = [
    ...(withExtension.tracks ?? []),
    ...chainTracks.filter(t => !ids.has(t.trackId)),
  ]

  return enhanceConfigObject(withExtension)
}

// the annotation a multi-way lane draws for this hub, the NCBI GFF first and
// then the hub's own gene tracks in the order the Hubs plugin picks them
const GENE_TRACK_SUFFIXES = [
  'ncbiGff',
  'ncbiRefSeq',
  'ncbiRefSeqCurated',
  'ncbiGene',
  'refGene',
  'ensGene',
  'augustusGene',
  'xenoRefGene',
]

export function genarkGeneTrackId(config: JBrowseConfig, accession: string) {
  const ids = new Set(config.tracks?.map(track => track.trackId))
  return GENE_TRACK_SUFFIXES.map(suffix => `${accession}-${suffix}`).find(id =>
    ids.has(id),
  )
}

/**
 * The staging sibling of a hub's config: the config plus one multi-way
 * synteny track over its liftOver pairs, for a hub with enough of them.
 * Undefined for the rest, so no sibling is written
 */
export function stagingHubConfig(
  config: JBrowseConfig,
  accession: string,
  {
    genomes,
    labelOf,
  }: {
    genomes: Record<string, StarGenome>
    labelOf: (mate: string) => string
  },
): JBrowseConfig | undefined {
  const star = multiwayStarTrack({
    config,
    assemblyName: accession,
    genomes,
    labelOf,
    geneTrackId: genarkGeneTrackId(config, accession),
  })
  return star
    ? { ...config, tracks: [...(config.tracks ?? []), star] }
    : undefined
}
