import fs from 'fs'

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
  'TabulaMurisFacsCoverage',
  'TabulaMurisFacsJunctions',
])

const specializedTypes = new Set(['pgSnp', 'bigPsl'])

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

interface RemovedTrack {
  trackId: string
  name: string
  reason: string
  assembly: string
}

// Cache of removed tracks per assembly
const removedTracksByAssembly: Map<string, RemovedTrack[]> = new Map()

/**
 * Logs a removed track to the assembly-specific cache
 */
function logRemovedTrack(
  assembly: string,
  trackId: string,
  name: string,
  reason: string,
) {
  if (!removedTracksByAssembly.has(assembly)) {
    removedTracksByAssembly.set(assembly, [])
  }
  removedTracksByAssembly.get(assembly)!.push({
    trackId,
    name,
    reason,
    assembly,
  })
}

/**
 * Writes the removed tracks for an assembly to disk
 */
export function writeRemovedTracks(assembly: string) {
  const tracks = removedTracksByAssembly.get(assembly)
  if (!tracks || tracks.length === 0) {
    return
  }

  const dir = 'removedTracks'
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true })
  }

  const filename = `${dir}/${assembly}.json`
  try {
    fs.writeFileSync(filename, JSON.stringify(tracks, null, 2))
  } catch (error) {
    console.error(`Error writing removed tracks for ${assembly}: ${error}`)
  }
}

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
  const { ucsc } = metadata ?? {}
  const assembly = assemblyNames[0]

  if (assembly === 'hs1') {
    const cat0 = name
    if (
      cat0.startsWith('Primate Chain/Net') ||
      cat0.startsWith('Human liftOver')
    ) {
      const trackId = ucsc ? `${ucsc.track}` : name
      logRemovedTrack(
        assembly,
        trackId,
        name,
        'Primate Chain/Net or Human liftOver track',
      )
      return undefined
    } else if (
      cat0.startsWith('CHM13') ||
      cat0.startsWith('SGDP') ||
      cat0.startsWith('T2T Encode')
    ) {
      const trackId = ucsc ? `${ucsc.track}` : name
      logRemovedTrack(
        assembly,
        trackId,
        name,
        'CHM13, SGDP, or T2T Encode track',
      )
      return undefined
    } else {
      return track
    }
  } else if (ucsc) {
    const trackType = `${ucsc.type}`.split(' ')[0]!
    const trackParent = `${ucsc.parent}`.split(' ')[0]!
    const trackId = `${ucsc.track}`

    let reason: string | null = null

    if (specializedTypes.has(trackType)) {
      reason = `Specialized type: ${trackType}`
    } else if (specializedParents.has(trackParent)) {
      reason = `Specialized parent: ${trackParent}`
    } else if (trackParent.startsWith('pgSnp')) {
      reason = `Parent starts with pgSnp: ${trackParent}`
    } else if (specializedTrackIds.has(trackId)) {
      reason = `Specialized track ID: ${trackId}`
    } else if (trackId.startsWith('encode3')) {
      reason = `Track ID starts with encode3`
    } else if (ucsc.barChartBars) {
      reason = 'Track has barChartBars'
    } else if (ucsc.barChartCategoryUrl) {
      reason = 'Track has barChartCategoryUrl'
    }

    if (reason) {
      logRemovedTrack(assembly, trackId, name, reason)
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
