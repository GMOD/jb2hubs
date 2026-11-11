import { categoryLabel, withBlocksAsNotExons } from 'hubtools'

import { descriptionAnchor } from './descriptionLink.ts'
import { splitOnFirst } from './util.ts'
import {
  inheritedTrackDbSetting,
  parentTrackName,
  parseTrackDbSettings,
} from './utils/trackDbSettings.ts'

import type { TrackDbEntry, UcscTrack } from './types.ts'

/**
 * A track's trackDb settings as `metadata.ucsc`, where `html` links its
 * description page (trackDescriptions.ts) when it has trackDb prose. The
 * settings' own `html`, which names the prose's source file, never survives:
 * JBrowse reads `metadata.ucsc.html` as the description.
 */
export function withDescriptionLink(
  settings: Record<string, unknown>,
  db: string,
  track: string,
  html: string,
) {
  const { html: _html, ...rest } = settings
  return {
    ...rest,
    ...(html.trim() ? { html: descriptionAnchor(db, track) } : {}),
  }
}

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
  const [db, trackLabelWithoutAssemblyName] = splitOnFirst(track.trackId, '-')
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
      // A golden-path table's type column is left out when its settings text
      // has no type line: feeding it in changed no track across the 238
      // configs compared on 2026-10-20, only added the key to 424 files.
      ucsc: withDescriptionLink(
        trackMetadata,
        db,
        trackLabelWithoutAssemblyName,
        html,
      ),
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
