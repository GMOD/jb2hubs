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
  // Human Methylation Atlas: ~247 tracks, too many to load by default.
  // TODO: allow loading these via a connection in the future.
  'humanMethylationAtlasSummary',
  'humanMethylationAtlasSignals',
  'cCREs_view',
  'CTCF_view',
  'DNase_view',
  'H3K27ac_view',
  'H3K4me3_view',
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
const removedTracksByAssembly = new Map<string, RemovedTrack[]>()

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

export function getTrackModifications<
  T extends {
    metadata?: {
      ucsc?: Record<string, unknown>
      addedByJBrowseTeam?: boolean
      multiWigContainer?: boolean
    }
    name: string
    category?: string[]
    assemblyNames: string[]
  },
>(track: T): T | undefined {
  const { name, assemblyNames, metadata } = track
  const { ucsc } = metadata ?? {}
  const assembly = assemblyNames[0]!

  // A multiWig aggregate (mergeMultiWigTracks.ts) is one track carrying its
  // subtracks as rows, so the rules below, which exist to keep track *counts*
  // down, don't apply to it. Its trackId is the composite's, which for the
  // ENCODE ones would otherwise match the wgEncode rule.
  if (metadata?.multiWigContainer) {
    return track
  }

  if (assembly === 'hs1') {
    let reason: string | null = null
    if (
      name.startsWith('Primate Chain/Net') ||
      name.startsWith('Human liftOver')
    ) {
      reason = 'Primate Chain/Net or Human liftOver track'
    } else if (
      name.startsWith('CHM13') ||
      name.startsWith('SGDP') ||
      name.startsWith('T2T Encode')
    ) {
      reason = 'CHM13, SGDP, or T2T Encode track'
    }
    if (reason) {
      logRemovedTrack(assembly, ucsc ? `${ucsc.track}` : name, name, reason)
      return undefined
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
    } else if (trackId.startsWith('encode') || trackId.startsWith('wgEncode')) {
      reason = `Track ID starts with encode or wgEncode`
    } else if (
      typeof ucsc.bigDataUrl === 'string' &&
      ucsc.bigDataUrl.includes('fantom')
    ) {
      reason = 'bigDataUrl includes fantom'
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

  const ucscTrackId = ucsc?.track
  const isGnomad =
    typeof ucscTrackId === 'string' &&
    (ucscTrackId.startsWith('gnomadGenomes') ||
      ucscTrackId.startsWith('gnomadExomes'))

  const modifiedName =
    isGnomad && !name.startsWith('gnomAD ') ? `gnomAD ${name}` : name

  return {
    ...track,
    name: modifiedName,
    category: track.category ? [...new Set(track.category)] : track.category,
  }
}
