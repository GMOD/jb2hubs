import fs from 'fs'
import path from 'path'

import { categoryLabel, formatJson, notEmpty } from 'hubtools'

import {
  getTrackModifications,
  removedTracksFor,
} from './getTrackModifications.ts'
import { replaceLink, splitOnFirst } from './util.ts'

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
      .map(track => {
        const [, trackLabelWithoutAssemblyName] = splitOnFirst(
          track.trackId,
          '-',
        )
        const trackDbEntry = tracksDb[trackLabelWithoutAssemblyName]
        const currentCategories = track.category ?? []

        if (trackDbEntry) {
          const { settings, html, longLabel, shortLabel, grp } = trackDbEntry
          const trackMetadata = Object.fromEntries(
            settings
              .split('\n')
              .map(r => splitOnFirst(r, ' '))
              .filter(([key]) => !!key),
          )

          const parentTrackId = trackMetadata.parent
            ? splitOnFirst(trackMetadata.parent, ' ')[0]
            : undefined
          const parentTrack = parentTrackId
            ? tracksDb[parentTrackId]
            : undefined

          const isAddedByJBrowseTeam = !!track.metadata?.addedByJBrowseTeam
          return {
            ...track,
            metadata: {
              ...track.metadata,
              ucsc: {
                ...trackMetadata,
                html: replaceLink(html),
              },
            },
            name: isAddedByJBrowseTeam
              ? track.name
              : [
                  ...new Set(
                    [parentTrack?.shortLabel, shortLabel].filter(Boolean),
                  ),
                ].join(' - '),
            description: longLabel,
            category: [
              ...new Set(
                [
                  ...currentCategories,
                  ...(grp ? [categoryLabel(grp)] : []),
                ].filter(Boolean),
              ),
            ],
          }
        } else {
          return track
        }
      })
      .map(track => getTrackModifications(track))
      .filter(notEmpty)

    counts.dropped = before - config.tracks.length
    const removed = removedTracksFor(assemblyName)
    if (removed.length > 0 && !compareOnly) {
      const dir = 'removedTracks'
      fs.mkdirSync(dir, { recursive: true })
      fs.writeFileSync(
        path.join(dir, `${assemblyName}.json`),
        formatJson(removed),
      )
    }
    return counts
  },
}
