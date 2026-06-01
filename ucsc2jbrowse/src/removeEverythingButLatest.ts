import { readConfig, writeJSON } from './util.ts'

function removeEverythingButLatest(configPath: string) {
  const config = readConfig(configPath)

  const prefixes = [
    'wgEncodeGencodePolyaV',
    'wgEncodeGencodePseudoGeneV',
    'wgEncodeGencodeCompV',
    'wgEncodeGencodeBasicV',
    'wgEncodeGencode2wayConsPseudoV',
    'cloneEndABC',
  ]

  const toRemove = new Set(
    prefixes.flatMap(prefix => {
      const matching = config.tracks
        .filter(t => t.trackId.startsWith(prefix))
        .sort((a, b) =>
          a.trackId.localeCompare(b.trackId, undefined, { numeric: true }),
        )
      return matching.slice(0, -1).map(t => t.trackId)
    }),
  )

  writeJSON(configPath, {
    ...config,
    tracks: config.tracks.filter(t => !toRemove.has(t.trackId)),
  })
}

if (process.argv.length !== 3) {
  console.error('Usage: node removeEverythingButLatest.ts <config.json>')
  process.exit(1)
}

removeEverythingButLatest(process.argv[2]!)
