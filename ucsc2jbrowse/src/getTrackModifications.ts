const specializedParents = new Set([
  'exomeProbesets',
  'genotypeArrays',
  'genePredArchive',
  'lincRNAsAllCellType',
  'knownGeneArchive',
  'affyExonProbe',
  'burgeRnaSeqGemMapperAlignViewRawSignal',
  'burgeRnaSeqGemMapperAlignViewAlignments',
  'gtexEqtlTissue',
  'gtexCov',
  'gnomadPext',
  'gdcCancer',
  'affyExonProbeset',
  'cloneEndSuper',
  'per_expr_models_view',
  'sample_models_view',
  'per_expr_reads_view',
])

const specializedTypes = new Set(['pgSnp', 'bigPsl'])

const specializedGroups = new Set(['denisova', 'neandertal'])

const specializedTrackIds = new Set([
  'gtexGene',
  'gtexGeneV8',
  'gtexTranscExpr',
  'hgIkmc',
  'crisprAllTargets',
  'lincRNAsTranscripts',
  'lrgTranscriptAli',
  'mavedb_maps',
  'mavedb_align_dna',
  'mavedb_align_aa',
])

/**
 * Modifies a track's configuration based on its metadata.
 * If the track should be categorized as 'Uncommon or Specialized tracks',
 * adds that category to the track's category array.
 * @param track The track object to modify.
 * @returns The modified track object, or undefined if the track should be deleted.
 */
export function getTrackModifications<
  T extends {
    metadata?: Record<string, unknown>
    category?: string[]
    assemblyNames: string[]
  },
>(track: T): T | undefined {
  // Delete tracks with "Primate Chain/Net" as the first category
  const { assemblyNames, metadata, category } = track
  if (assemblyNames[0] === 'hs1') {
    const cat0 = category?.[0]
    if (cat0 === 'Primate Chain/Net' || cat0 === 'Human liftOver') {
      return undefined
    } else if (cat0 === 'NCBI RefSeq') {
      return {
        ...track,
        category: ['Genes and Gene Predictions'],
      }
    } else {
      return track
    }
  } else if (metadata) {
    const trackType = `${metadata.type}`.split(' ')[0]!
    const trackParent = `${metadata.parent}`.split(' ')[0]!
    const trackGroup = `${metadata.group}`.split(' ')[0]!
    const trackId = `${metadata.track}`
    const flag =
      specializedTypes.has(trackType) ||
      specializedParents.has(trackParent) ||
      specializedGroups.has(trackGroup) ||
      specializedTrackIds.has(trackId) ||
      !!metadata.barChartBars ||
      !!metadata.barChartCategoryUrl

    if (flag) {
      return {
        ...track,
        category: ['Uncommon or Specialized tracks'].concat([
          ...new Set(track.category ?? []),
        ]),
      }
    }
  }
  return track
}
