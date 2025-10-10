import { categoryMap } from 'hubtools'

import { getTrackModifications } from './getTrackModifications.ts'
import {
  readConfig,
  readJSON,
  replaceLink,
  splitOnFirst,
  writeJSON,
} from './util.ts'

import type { TrackDbEntry } from './types'

type TracksDb = Record<string, TrackDbEntry>

/**
 * Adds metadata from a trackDb.json file to a JBrowse configuration's tracks.
 * @param configPath The path to the JBrowse configuration file.
 * @param tracksDbPath The path to the tracksDb.json file.
 */
function addMetadata(configPath: string, tracksDbPath: string) {
  const config = readConfig(configPath)
  let tracksDb: TracksDb | undefined
  try {
    tracksDb = readJSON<Record<string, TrackDbEntry>>(tracksDbPath)
  } catch (e) {
    console.error(`no tracksDb for ${configPath}`)
  }

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

          return {
            ...track,
            metadata: {
              ...track.metadata,
              ...trackMetadata,
              html: replaceLink(html),
            },
            name: [parentTrack?.shortLabel, shortLabel]
              .filter(f => !!f)
              .join(' - '),
            description: longLabel,
            category: [
              ...new Set(
                [
                  ...currentCategories,
                  ...(grp
                    ? // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
                      [categoryMap[grp as keyof typeof categoryMap] ?? grp]
                    : []),
                ].filter(f => !!f),
              ),
            ],
          }
        } else {
          // console.warn('Track not found in trackDb', track.trackId)
          return track
        }
      })
      .map(track => getTrackModifications(track))
      .filter(
        (track): track is NonNullable<typeof track> => track !== undefined,
      ),
  })
}

if (process.argv.length !== 4) {
  console.error('Usage: node addMetadata.ts <config.json> <tracksDb.json>')
  process.exit(1)
}

addMetadata(process.argv[2]!, process.argv[3]!)
