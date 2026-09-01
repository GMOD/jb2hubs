import type { JBrowseConfig } from './types.ts'

// Track ID prefixes that are versioned (e.g. wgEncodeGencodeCompV5,
// wgEncodeGencodeCompV46). For each prefix we keep only the latest version and
// remove the rest.
export const VERSIONED_PREFIXES = [
  'wgEncodeGencodePolyaV',
  'wgEncodeGencodePseudoGeneV',
  'wgEncodeGencodeCompV',
  'wgEncodeGencodeBasicV',
  'wgEncodeGencode2wayConsPseudoV',
  'cloneEndABC',
]

// Returns the set of track IDs that are outdated versions, i.e. every track
// matching a versioned prefix except the highest-numbered one. Numeric
// collation is required so that V46 sorts after V9 (lexical sort would keep V9).
export function findOutdatedTrackIds(
  tracks: { trackId: string }[],
  prefixes = VERSIONED_PREFIXES,
) {
  const toRemove = new Set<string>()
  for (const prefix of prefixes) {
    const matching = tracks
      .filter(t => t.trackId.startsWith(prefix))
      .sort((a, b) =>
        a.trackId.localeCompare(b.trackId, undefined, { numeric: true }),
      )
    for (const t of matching.slice(0, -1)) {
      toRemove.add(t.trackId)
    }
  }
  return toRemove
}

export function removeOutdatedTracks(config: JBrowseConfig) {
  const toRemove = findOutdatedTrackIds(config.tracks)
  config.tracks = config.tracks.filter(t => !toRemove.has(t.trackId))
}
