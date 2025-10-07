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

const specializedTypes = new Set(['pgSnp'])

const specializedGroups = new Set(['denisova', 'neandertal'])

const specializedTrackIds = new Set([
  'gtexGene',
  'gtexGeneV8',
  'gtexTranscExpr',
  'hgIkmc',
  'crisprAllTargets',
])

/**
 * Checks if a given track should be categorized as 'Uncommon or Specialized tracks'
 * based on its metadata (type, parent, group, or trackId).
 * @param track The track object, potentially containing metadata.
 * @returns True if the track should be in the specialized category, false otherwise.
 */
export function checkIfTrackGoesInSpecializedCategory({
  metadata,
}: {
  metadata?: Record<string, unknown>
}): boolean {
  if (!metadata) {
    return false
  }

  const trackType = `${metadata.type}`.split(' ')[0]!
  const trackParent = `${metadata.parent}`.split(' ')[0]!
  const trackGroup = `${metadata.group}`.split(' ')[0]!
  const trackId = `${metadata.track}`
  return (
    specializedTypes.has(trackType) ||
    specializedParents.has(trackParent) ||
    specializedGroups.has(trackGroup) ||
    specializedTrackIds.has(trackId) ||
    !!metadata.barChartBars
  )
}
