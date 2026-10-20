import { categoryLabel, withBlocksAsNotExons } from 'hubtools'

import { replaceLink, splitOnFirst } from './util.ts'
import {
  inheritedTrackDbSetting,
  parentTrackName,
  parseTrackDbSettings,
} from './utils/trackDbSettings.ts'

import type { TrackDbEntry, UcscTrack } from './types.ts'

/**
 * Names, describes and categorizes a `<db>-<table>` track from its trackDb
 * entry, and returns it unchanged when the table has none. The drop rules in
 * getTrackModifications read the name and `metadata.ucsc` this sets, so
 * addMetadata and keptTables both build tracks here.
 */
export function withTrackDbMetadata(
  track: UcscTrack,
  tracksDb: Record<string, TrackDbEntry>,
): UcscTrack {
  const [, trackLabelWithoutAssemblyName] = splitOnFirst(track.trackId, '-')
  const trackDbEntry = tracksDb[trackLabelWithoutAssemblyName]
  if (!trackDbEntry) {
    return track
  }
  const currentCategories = track.category ?? []
  const { settings, html, longLabel, shortLabel, grp } = trackDbEntry
  const trackMetadata = parseTrackDbSettings(settings)
  const parentTrackId = parentTrackName(trackMetadata)
  const parentTrack = parentTrackId ? tracksDb[parentTrackId] : undefined

  const isAddedByJBrowseTeam = !!track.metadata?.addedByJBrowseTeam
  return {
    ...track,
    adapter: withBlocksAsNotExons(
      track.adapter,
      trackLabelWithoutAssemblyName,
      inheritedTrackDbSetting(
        tracksDb,
        trackLabelWithoutAssemblyName,
        'exonNumbers',
      ),
    ),
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
          ...new Set([parentTrack?.shortLabel, shortLabel].filter(Boolean)),
        ].join(' - '),
    description: longLabel,
    category: [
      ...new Set(
        [...currentCategories, ...(grp ? [categoryLabel(grp)] : [])].filter(
          Boolean,
        ),
      ),
    ],
  }
}
