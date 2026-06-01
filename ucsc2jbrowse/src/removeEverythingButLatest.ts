import { fileURLToPath } from 'node:url'

import { readConfig, writeJSON } from './util.ts'

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

function removeEverythingButLatest(configPath: string) {
  const config = readConfig(configPath)
  const toRemove = findOutdatedTrackIds(config.tracks)
  writeJSON(configPath, {
    ...config,
    tracks: config.tracks.filter(t => !toRemove.has(t.trackId)),
  })
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  if (process.argv.length !== 3) {
    console.error('Usage: node removeEverythingButLatest.ts <config.json>')
    process.exit(1)
  }
  removeEverythingButLatest(process.argv[2]!)
}
