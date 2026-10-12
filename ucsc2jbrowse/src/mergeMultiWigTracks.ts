import { checkIfFileAccessible } from './checkIfFileAccessible.ts'
import { resolveBigDataUri } from './resolveBigDataUri.ts'
import { noTableFiles } from './resolveTableBigFile.ts'
import {
  parentTrackName,
  parseTrackDbSettings,
} from './utils/trackDbSettings.ts'

import type { TableFileResolver } from './resolveTableBigFile.ts'
import type { TrackDbEntry } from './types.ts'

/**
 * UCSC `container multiWig` composites are one logical track whose subtracks are
 * per-organ or per-cell-line signal drawn overlaid, each with its own color:
 * "CTCF (Layered)" is 51 organ averages, not 51 tracks. JBrowse models exactly
 * that as a MultiQuantitativeTrack over a MultiWiggleAdapter, so each container
 * converts to a single track with one subadapter per subtrack.
 *
 * Without this the subtracks either land as N unrelated QuantitativeTracks or,
 * for the ENCODE ones, get dropped wholesale by the "too many to load" rule in
 * getTrackModifications.ts. One track carrying its rows is both smaller than N
 * tracks and the thing a reader wants: signal across tissues at a locus.
 */

// A type alias rather than an interface: only an alias gets TypeScript's implicit
// index signature, which mergeBigFileTracks needs to hand these tracks to its
// `Record<string, unknown>` mixin merge.
export type MultiWigTrack = {
  trackId: string
  name: string
  type: 'MultiQuantitativeTrack'
  assemblyNames: string[]
  metadata: { multiWigContainer: true }
  displays?: {
    type: 'MultiLinearWiggleDisplay'
    defaultRendering: 'xyplot'
  }[]
  adapter: {
    type: 'MultiWiggleAdapter'
    subadapters: {
      type: 'BigWigAdapter'
      name: string
      color?: string
      bigWigLocation: { uri: string }
    }[]
  }
}

/**
 * Build one MultiQuantitativeTrack per multiWig container, plus the set of
 * subtrack table names they consumed so the caller doesn't also emit those
 * individually. A subtrack's file comes from its `bigDataUrl`, or, for the
 * legacy composites that name none, from `resolveTable` (see
 * resolveTableBigFile.ts). A container with no resolvable subtrack is skipped.
 *
 * Every subtrack's file goes through the same url check the single-file tracks
 * do, because one 404 child fails the whole MultiWiggleAdapter; a container
 * left with no accessible subtrack is skipped too.
 */
export async function buildMultiWigTracks({
  tracksDb,
  assemblyName,
  baseUrl,
  resolveTable = noTableFiles,
}: {
  tracksDb: Record<string, TrackDbEntry>
  assemblyName: string
  baseUrl: string
  resolveTable?: TableFileResolver
}): Promise<{ tracks: MultiWigTrack[]; consumed: Set<string> }> {
  const entries = Object.entries(tracksDb).map(
    ([tableName, entry]) =>
      [tableName, entry, parseTrackDbSettings(entry.settings)] as const,
  )

  const childrenByParent = new Map<string, typeof entries>()
  for (const row of entries) {
    const parent = parentTrackName(row[2])
    if (parent) {
      const existing = childrenByParent.get(parent)
      if (existing) {
        existing.push(row)
      } else {
        childrenByParent.set(parent, [row])
      }
    }
  }

  const tracks: MultiWigTrack[] = []
  const consumed = new Set<string>()
  for (const [tableName, entry, settings] of entries) {
    if (settings.container !== 'multiWig') {
      continue
    }
    const children = []
    for (const [childTable, childEntry, childSettings] of childrenByParent.get(
      tableName,
    ) ?? []) {
      const bigDataUrl = childSettings.bigDataUrl
      const uri = bigDataUrl
        ? resolveBigDataUri({ bigDataUrl, baseUrl })
        : resolveTable(childSettings.table ?? childTable)
      if (
        uri &&
        (await checkIfFileAccessible({
          url: uri,
          assembly: assemblyName,
          trackName: childEntry.longLabel || childTable,
        }))
      ) {
        children.push({ childTable, childEntry, childSettings, uri })
      }
    }
    if (children.length === 0) {
      continue
    }
    // UCSC's `aggregate transparentOverlay`/`solidOverlay` means "draw the
    // subtracks in one shared plot", which is the overlaid `xyplot` rendering
    // rather than the one-row-per-subtrack default, and the one spelling both
    // v4.3.0 and v5 read. It matters at this row count: 55 organs stacked in a
    // default-height track is unreadable, overlaid it is the familiar layered
    // signal. `aggregate stacked` has no JBrowse equivalent, so it falls through
    // to the row default.
    const overlaid =
      settings.aggregate === 'transparentOverlay' ||
      settings.aggregate === 'solidOverlay'
    tracks.push({
      trackId: `${assemblyName}-${tableName}`,
      name: entry.shortLabel,
      type: 'MultiQuantitativeTrack',
      assemblyNames: [assemblyName],
      metadata: { multiWigContainer: true },
      ...(overlaid
        ? {
            displays: [
              {
                type: 'MultiLinearWiggleDisplay' as const,
                defaultRendering: 'xyplot' as const,
              },
            ],
          }
        : {}),
      adapter: {
        type: 'MultiWiggleAdapter',
        subadapters: children.map(
          ({ childTable, childEntry, childSettings, uri }) => ({
            type: 'BigWigAdapter' as const,
            // shortLabel is the organ/cell-line label UCSC shows in its own
            // subtrack list, and becomes the row label
            name: childEntry.shortLabel || childTable,
            ...(childSettings.color
              ? { color: `rgb(${childSettings.color})` }
              : {}),
            bigWigLocation: { uri },
          }),
        ),
      },
    })
    for (const { childTable } of children) {
      consumed.add(childTable)
    }
  }
  return { tracks, consumed }
}
