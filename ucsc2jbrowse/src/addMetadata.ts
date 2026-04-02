import path from 'path'

import { categoryMap, notEmpty } from 'hubtools'

import {
  getTrackModifications,
  writeRemovedTracks,
} from './getTrackModifications.ts'
import {
  readConfig,
  readJSON,
  replaceLink,
  splitOnFirst,
  writeJSON,
} from './util.ts'

import type { TrackDbEntry } from './types'

type TracksDb = Record<string, TrackDbEntry>

function addMetadata(configPath: string, tracksDbPath: string) {
  const config = readConfig(configPath)
  let tracksDb: TracksDb | undefined
  try {
    tracksDb = readJSON<Record<string, TrackDbEntry>>(tracksDbPath)
  } catch (e) {
    console.error(`no tracksDb for ${configPath}`)
  }

  const assembly = path.basename(path.dirname(configPath))

  writeJSON(configPath, {
    ...config,
    tracks: config.tracks
      .map(track => {
        const [, trackLabelWithoutAssemblyName] = splitOnFirst(
          track.trackId,
          '-',
        )
        const trackDbEntry = tracksDb?.[trackLabelWithoutAssemblyName]
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
            ? tracksDb?.[parentTrackId]
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
                  ...(grp
                    ? // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
                      [categoryMap[grp as keyof typeof categoryMap] ?? grp]
                    : []),
                ].filter(Boolean),
              ),
            ],
          }
        } else {
          // console.warn('Track not found in trackDb', track.trackId)
          return track
        }
      })
      .map(track => getTrackModifications(track))
      .filter(notEmpty),
  })

  writeRemovedTracks(assembly)
}

if (process.argv.length !== 4) {
  console.error('Usage: node addMetadata.ts <config.json> <tracksDb.json>')
  process.exit(1)
}

addMetadata(process.argv[2]!, process.argv[3]!)
