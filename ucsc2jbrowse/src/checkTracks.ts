import { readConfig, readJSON } from './util.ts'

interface TrackEntry {
  tableName: string
  url?: string
  html?: string
}

/**
 * Compares tracks from a JSON file with tracks in a JBrowse configuration
 * and outputs tracks present in the JSON file but not in the config.
 * @param tracksFilePath The path to the JSON file containing track entries.
 * @param configPath The path to the JBrowse configuration file.
 */
function checkTracks(tracksFilePath: string, configPath: string) {
  const tracks = readJSON<Record<string, TrackEntry>>(tracksFilePath)
  const config = readConfig(configPath)

  const trackTableNames = new Set(
    Object.values(tracks)
      .filter(t => !t.url?.includes('fantom'))
      .map(t => t.tableName),
  )

  const configTrackIds = new Set(config.tracks.map(t => t.trackId))

  const missingTracks = [...trackTableNames].filter(
    tableName => !configTrackIds.has(tableName),
  )

  const output = missingTracks.sort().map(tableName => {
    const { html, ...rest } = tracks[tableName]!
    return rest
  })

  // Output the result to stdout
  console.log(JSON.stringify(output, null, 2))
}

if (process.argv.length !== 4) {
  console.error('Usage: node checkTracks.ts <tracks.json> <config.json>')
  process.exit(1)
}

checkTracks(process.argv[2]!, process.argv[3]!)
