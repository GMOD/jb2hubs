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

// const specializedGroups = new Set(['denisova', 'neandertal'])

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

function _getTrackModifications<
  T extends {
    metadata?: {
      ucsc?: Record<string, unknown>
      addedByJBrowseTeam?: boolean
    }
    category?: string[]
    assemblyNames: string[]
    name: string
  },
>(track: T): T | undefined {
  // Delete tracks with "Primate Chain/Net" as the first category
  const { name, assemblyNames, metadata } = track
  const { ucsc } = metadata || {}
  if (assemblyNames[0] === 'hs1') {
    const cat0 = name
    if (
      cat0?.startsWith('Primate Chain/Net') ||
      cat0?.startsWith('Human liftOver')
    ) {
      return undefined
    } else if (
      cat0?.startsWith('CHM13') ||
      cat0?.startsWith('SGDP') ||
      // cat0?.startsWith('Long-read Variants') ||
      cat0?.startsWith('T2T Encode')
    ) {
      return undefined
    } else {
      return track
    }
  } else if (ucsc) {
    const trackType = `${ucsc.type}`.split(' ')[0]!
    const trackParent = `${ucsc.parent}`.split(' ')[0]!
    const trackId = `${ucsc.track}`
    const flag =
      specializedTypes.has(trackType) ||
      specializedParents.has(trackParent) ||
      specializedTrackIds.has(trackId) ||
      !!ucsc.barChartBars ||
      !!ucsc.barChartCategoryUrl

    if (flag) {
      return undefined
    }
  }
  return track
}

/**
 * Modifies a track's configuration based on its metadata.
 * Deletes tracks that would have been categorized as 'Uncommon or Specialized tracks'.
 * @param track The track object to modify.
 * @returns The modified track object, or undefined if the track should be deleted.
 */
export function getTrackModifications<
  T extends {
    metadata?: {
      ucsc?: Record<string, unknown>
      addedByJBrowseTeam?: boolean
    }
    name: string
    category?: string[]
    assemblyNames: string[]
  },
>(track: T): T | undefined {
  const modifiedTrack = _getTrackModifications(track)
  if (modifiedTrack?.category) {
    return {
      ...modifiedTrack,
      category: [...new Set(modifiedTrack.category)],
    }
  } else {
    return modifiedTrack
  }
}
