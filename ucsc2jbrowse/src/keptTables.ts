import { fileURLToPath } from 'url'

import { BED_TABIX, tabixTrack } from './addTabixTrackToConfig.ts'
import { getTrackModifications } from './getTrackModifications.ts'
import { applyUcscExtension, readUcscExtension } from './makeUcscExtensions.ts'
import { withTrackDbMetadata } from './trackDbMetadata.ts'
import { readJSON } from './util.ts'

import type { ConfigExtension, JBrowseConfig, TrackDbEntry } from './types.ts'

/**
 * The tracks.json keys whose derived track would survive the drop rules in
 * getTrackModifications. Each key goes through the same steps buildConfigs
 * gives a derived tabix track before addMetadata: the extension merge, then
 * withTrackDbMetadata.
 */
export function keptTables(
  assemblyName: string,
  tracksDb: Record<string, TrackDbEntry>,
  extension?: ConfigExtension,
) {
  const keys = Object.keys(tracksDb)
  const base: JBrowseConfig = {
    assemblies: [{ name: assemblyName }],
    tracks: keys.map(key =>
      tabixTrack(assemblyName, `${key}${BED_TABIX.extension}`, BED_TABIX),
    ),
  }
  const config = extension
    ? applyUcscExtension(assemblyName, base, extension)
    : base
  const byTrackId = new Map(config.tracks.map(t => [t.trackId, t]))
  return keys.filter(key => {
    const track = byTrackId.get(`${assemblyName}-${key}`)!
    return getTrackModifications(withTrackDbMetadata(track, tracksDb))
  })
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const [assemblyName, tracksJson] = process.argv.slice(2)
  if (!assemblyName || !tracksJson) {
    throw new Error('usage: node keptTables.ts <db> <tracks.json>')
  }
  const tracksDb = readJSON<Record<string, TrackDbEntry>>(tracksJson)
  const kept = keptTables(
    assemblyName,
    tracksDb,
    readUcscExtension(assemblyName),
  )
  if (kept.length === 0 && Object.keys(tracksDb).length > 0) {
    throw new Error(
      `${assemblyName}: the drop rules kept none of ${Object.keys(tracksDb).length} tables`,
    )
  }
  for (const key of kept) {
    console.log(key)
  }
}
