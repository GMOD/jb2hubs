import fs from 'fs'
import path from 'path'

import { readJSON } from './util.ts'

import type { FinalizeStep } from './utils/finalizeStep.ts'

const BASE_RENAMES_DIR = 'ucscRenames'

/**
 * Applies ucscRenames/<db>.json: a trackId -> new name map, where the name
 * `DELETE` removes the track instead.
 */
export const rewriteUcscTrackNames: FinalizeStep = {
  name: 'track renames',
  run: ({ assemblyName, config }) => {
    const counts: Record<string, number> = {}
    const file = path.join(BASE_RENAMES_DIR, `${assemblyName}.json`)
    if (fs.existsSync(file)) {
      const mappings = readJSON<Record<string, string>>(file)
      for (const [trackId, newName] of Object.entries(mappings)) {
        if (newName === 'DELETE') {
          const before = config.tracks.length
          config.tracks = config.tracks.filter(t => t.trackId !== trackId)
          counts.deleted = (counts.deleted ?? 0) + before - config.tracks.length
        } else {
          const track = config.tracks.find(t => t.trackId === trackId)
          if (track) {
            track.name = newName
            counts.renamed = (counts.renamed ?? 0) + 1
          }
        }
      }
    }
    return counts
  },
}
