import path from 'path'

import { writeJSON } from './util.ts'

import type { JBrowseConfig } from './types.ts'
import type { FinalizeStep } from './utils/finalizeStep.ts'

/**
 * Track categories to include in minimal configs.
 * These are matched against the trackId (case-insensitive).
 */
const MINIMAL_TRACK_PATTERNS = [
  'ncbirefseq', // NCBI RefSeq tracks
  'gencode', // GENCODE tracks
  'rmsk', // RepeatMasker tracks
  'gap', // Gap tracks (gap, gapOverlap)
  'allgaps', // also a gap track, but not under the `gap` name
  'clinvar', // clinvarMain/Cnv/SubLolly, clinvarLift, clinVar<date> on hs1
]

/**
 * Whether a track belongs in the minimal config.
 *
 * A pattern has to match a whole trackId segment, not any substring of one.
 * These trackIds are `<db>-<ucscTrackName>`, so anchoring at the start or just
 * after a dash names the track group and nothing else.
 *
 * As a bare substring, `gencode` also matched every ENCODE regulation track,
 * because `hg38-wgEncodeReg4Dnase` lowercases to `hg38-wgencodereg4dnase` and
 * `wgencode` contains `gencode`. That put 11 of hg38's 33 minimal tracks -- and
 * 82% of its bytes -- into a file whose whole purpose is to be small: 241KB
 * against 43KB without them, on the artifact the hubs plugin now fetches to
 * resolve a genome on demand. `gap` collected `veGAPseudogene` and `cGAPSage`
 * the same way.
 */
export function shouldIncludeTrack(trackId: string) {
  const lower = trackId.toLowerCase()
  return MINIMAL_TRACK_PATTERNS.some(
    pattern => lower.startsWith(pattern) || lower.includes(`-${pattern}`),
  )
}

/**
 * The tracks a config's own defaultSession opens, which have to survive the
 * filter or the minimal config boots to an empty view.
 *
 * generateDefaultSessions picks the best gene track an assembly actually has --
 * ncbiRefSeq, ncbiRefSeqCurated, ncbiGene, refGene, ensGene, augustusGene,
 * xenoRefGene -- and only the first three are names the patterns above know.
 * Every UCSC assembly predating ncbiRefSeq therefore opened a track the minimal
 * config had dropped, which was 134 of the 238: hg18 and mm9 named refGene,
 * danRer4 ensGene, the invertebrates augustusGene or xenoRefGene. Deriving the
 * exception from the session rather than restating the priority list keeps the
 * two from drifting apart again.
 */
export function minimalTracks(config: JBrowseConfig) {
  const sessionTrackIds = new Set<string>()
  for (const view of config.defaultSession?.views ?? []) {
    // `?? []` because a session built by hubtools' makeDefaultSession has no
    // `tracks` key -- see the note on DefaultSession in types.ts. Iterating it
    // directly threw, and finalizeConfigs catches per assembly, so the only
    // symptom was one error line and a missing minimal.json.
    for (const trackId of view.init.tracks ?? []) {
      sessionTrackIds.add(trackId)
    }
  }
  return config.tracks
    .filter(
      track =>
        shouldIncludeTrack(track.trackId) || sessionTrackIds.has(track.trackId),
    )
    .map(({ category, ...rest }) => rest)
}

/**
 * Writes minimal.json beside config.json: the same assemblies, plugins,
 * configuration and defaultSession, with the track list filtered down.
 *
 * The only step here that does not mutate ctx.config — it derives a second
 * artifact from it, which is why it has to come last, after the defaultSession
 * whose gene track it is obliged to keep.
 */
export const createMinimalConfig: FinalizeStep = {
  name: 'minimal configs',
  run: ({ dir, config }) => {
    const tracks = minimalTracks(config)
    writeJSON(path.join(dir, 'minimal.json'), { ...config, tracks })
    return {
      'tracks kept': tracks.length,
      'tracks dropped': config.tracks.length - tracks.length,
    }
  },
}
