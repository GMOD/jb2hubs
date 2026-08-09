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

// Kept despite the `wgEncode` prefix rule below. That rule is there to stop
// ENCODE's individual-experiment composites (12,729 subtracks on hg38 alone)
// from swamping a config, and these are not experiments — they are the CRG GEM
// alignability and Duke uniqueness annotations, i.e. hg19's only mappability
// tracks, which say whether a read can be placed at a locus at all. hg38 keeps
// the same layer without needing an exemption, because its Umap/Bismap
// replacements are not `wgEncode`-prefixed; the effect of the blanket rule was
// therefore that hg19 alone had no mappability at all, while still carrying the
// blacklist, segdup and problematic-region tracks such a lane is read against.
//
// Eight tracks on one assembly (hg19 removedTracks holds 12,711 entries in
// total), so this does not move what the rule is for.
const keptDespiteEncodePrefix = new Set([
  'wgEncodeCrgMapabilityAlign24mer',
  'wgEncodeCrgMapabilityAlign36mer',
  'wgEncodeCrgMapabilityAlign40mer',
  'wgEncodeCrgMapabilityAlign50mer',
  'wgEncodeCrgMapabilityAlign75mer',
  'wgEncodeCrgMapabilityAlign100mer',
  'wgEncodeDukeMapabilityUniqueness20bp',
  'wgEncodeDukeMapabilityUniqueness35bp',
])

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

// A bigMaf whose R-tree granularity puts even a codon-sized query over the byte
// gate, so there is no zoom at which it opens. Measured 2026-08-08 against the
// hosted hg38 files, as the estimate JBrowse actually gates on
// (`BigBed.getRegionByteSizeMulti`, which is what BigMafAdapter delegates to)
// over a TP53 window, against the 1MB fetchSizeLimit LinearMafDisplay inherits:
//
//                  10bp     110bp    1kb      5kb      9.2kb    19kb
//   multiz470way   0.06MB   0.06MB   0.54MB   2.53MB   4.76MB   7.78MB
//   cactus447way   0.07MB   0.07MB   0.59MB   4.18MB   6.76MB  12.88MB
//   cactus241way  15.03MB  15.03MB  15.03MB  15.03MB  15.03MB  31.48MB
//
// The first two behave: they open at base zoom, gate in the middle, and hand
// over to `summaryAdapter` above 20kb. cactus241way is flat because its file
// declares `uncompressBufSize` 991429447 against multiz470way's 2365401, so its
// smallest readable unit is one ~15MB block however narrow the query. Nothing in
// a config can fix that, and raising `fetchSizeLimit` past it is worse than
// leaving it out: the flat estimate cannot tell 110bp from 9.2kb, where the real
// payload is 48MB of MAF text (11.8s just to fetch and decompress), and the only
// other way in is Force load, which is track-wide and session-long (see
// buildBigMafTrack.ts) so one click commits the user to that on every later pan.
//
// Dropped rather than kept-but-unusable because it is also near-redundant: 212
// of its 217 species are in cactus447way, same Zoonomia project, and that file
// reads incrementally. Re-check before restoring, since the fix belongs upstream
// at UCSC and would show up as this estimate tracking the span. Its
// `ucscMixins/hg38.json` entry (the hand-written `nhLocation`) went with it, so
// restoring the track means restoring that too or it comes back without a tree.
const unreadableBigMafTrackIds = new Set(['cactus241wayBM'])

// A chainNet subtrack, which UCSC also types `bigMaf`. It is a PAIRWISE net, not
// a multiple alignment, so converting it gives a MafTrack with one row and a
// sample list parsed out of a setting that isn't a species list: galGal6's three
// came out as `[{id: '2', label: 'Chicken/GRCg7b'}]` and mm39's as `[]`.
//
// Every `bigMaf` in the whole UCSC corpus is one of these two things, and the
// two never collide (measured over all built configs 2026-08-08):
//
//   real alignments   multiz470way, cactus447way, cactus241wayBM
//                     parent cons<N>wayView*
//   pairwise nets     net*, rbestNet*, synNet*   parent *Viewnet
//
// Matching the track id rather than the parent because `net<Target>` is UCSC's
// stable chainNet subtrack naming, and it cannot reach a `cons<N>way` alignment
// however the view is spelled.
//
// Pairwise alignment belongs in PIF here, which is what every `*_liftOver`
// SyntenyTrack already is. galGal6 loses nothing: the pair these three describe
// (GCF_016699485.2) is already served by galGal6_to_GCF_016699485.2_liftOver and
// its _chainBridge twin. mm39's GCF_003668045.3 has no PIF and cannot get one
// today, because hgdownload publishes no vsGCF_003668045.3 chain directory for
// it -- that alignment lives only under /gbdb/mm39/bbi/chainNet. Its
// `chainGCF_003668045.3` bigBed still carries the blocks, so the pair is not
// gone, just not synteny. See createChainTrackPifs.sh's unused `vs` source.
const CHAIN_NET_SUBTRACK = /^(net|rbestNet|synNet)([A-Z]|GC[AF]_)/

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
    } else if (unreadableBigMafTrackIds.has(trackId)) {
      reason = `bigMaf with block granularity coarser than the byte gate, so it opens at no zoom: ${trackId}`
    } else if (trackType === 'bigMaf' && CHAIN_NET_SUBTRACK.test(trackId)) {
      reason = `chainNet net typed bigMaf: a pairwise alignment, which belongs in a PIF synteny track rather than a one-row MafTrack: ${trackId}`
    } else if (
      (trackId.startsWith('encode') || trackId.startsWith('wgEncode')) &&
      !keptDespiteEncodePrefix.has(trackId)
    ) {
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
