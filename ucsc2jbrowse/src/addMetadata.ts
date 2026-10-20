import fs from 'fs'
import path from 'path'

import { formatJson, notEmpty } from 'hubtools'

import {
  getTrackModifications,
  removedTracksFor,
} from './getTrackModifications.ts'
import { withTrackDbMetadata } from './trackDbMetadata.ts'
import { UCSC_ROOT } from './util.ts'

import type { FinalizeStep } from './utils/finalizeStep.ts'

/**
 * Names, describes and categorizes each track from its trackDb entry, then
 * applies the drop rules in getTrackModifications. The tracks dropped are
 * reported to removedTracks/<db>.json, which mergeRemovedTracks.ts collects
 * for the website. Golden-path assemblies only: a hub assembly has no
 * tracks.json, and its trackDb prose came in with the hub.
 */
export const addMetadata: FinalizeStep = {
  name: 'track metadata',
  run: ({ assemblyName, tracksDb, config, compareOnly }) => {
    const counts: Record<string, number> = {}
    if (!tracksDb) {
      return counts
    }
    const before = config.tracks.length
    config.tracks = config.tracks
      .map(track => withTrackDbMetadata(track, tracksDb))
      .map(track => getTrackModifications(track))
      .filter(notEmpty)

    counts.dropped = before - config.tracks.length
    const removed = removedTracksFor(assemblyName)
    if (!compareOnly) {
      const dir = path.join(UCSC_ROOT, 'removedTracks')
      const file = path.join(dir, `${assemblyName}.json`)
      if (removed.length > 0) {
        fs.mkdirSync(dir, { recursive: true })
        fs.writeFileSync(file, formatJson(removed))
      } else {
        // An assembly that stops dropping tracks has to stop reporting them.
        // Only the merged removedTracks.json is cleared before a run, so a
        // stale per-db file kept feeding the unavailable-tracks page tracks
        // that are back -- and now that every config is rebuilt every run,
        // this branch is reached for every assembly rather than the changed
        // ones.
        fs.rmSync(file, { force: true })
      }
    }
    return counts
  },
}
