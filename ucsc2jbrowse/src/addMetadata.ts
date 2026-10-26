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
 * for the website. A hub assembly has no tracks.json, so its tracks keep the
 * hub's prose and no drop rule reaches them, but its report is still cleared:
 * hs1's, from its golden-path days, listed 204 tracks the config serves and
 * 348 under ids it no longer has.
 */
export const addMetadata: FinalizeStep = {
  name: 'track metadata',
  run: ({ assemblyName, tracksDb, config, compareOnly }) => {
    const counts: Record<string, number> = {}
    if (tracksDb) {
      const before = config.tracks.length
      config.tracks = config.tracks
        .map(track => withTrackDbMetadata(track, tracksDb))
        .map(track => getTrackModifications(track))
        .filter(notEmpty)
      counts.dropped = before - config.tracks.length
    }
    const removed = removedTracksFor(assemblyName)
    if (!compareOnly) {
      const dir = path.join(UCSC_ROOT, 'removedTracks')
      const file = path.join(dir, `${assemblyName}.json`)
      if (removed.length > 0) {
        fs.mkdirSync(dir, { recursive: true })
        fs.writeFileSync(file, formatJson(removed))
      } else {
        // only the merged removedTracks.json is cleared before a run, so a
        // stale per-db file would keep feeding the unavailable-tracks page
        fs.rmSync(file, { force: true })
      }
    }
    return counts
  },
}
