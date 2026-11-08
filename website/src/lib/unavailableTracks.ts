import { join } from 'path'

import { isArrayOf, isRecordOf, isShape, isString } from 'hubtools/guards'

import { readCheckedJsonIfPresent } from '../utils/readJson.ts'
import { groupBlockedFiles, isBlockedEntry } from './blockedFiles.ts'

import type { Guard } from 'hubtools/guards'

// ucsc2jbrowse/removedTracks.json: every track the converter filtered out.
export interface RemovedTrack {
  trackId: string
  name: string
  reason: string
  assembly: string
}

const isRemovedTrack: Guard<RemovedTrack> = isShape({
  trackId: isString,
  name: isString,
  reason: isString,
  assembly: isString,
})

// 41K individual filtered tracks made the page a 7.9MB document, and an
// undifferentiated list of them answers nobody's question. What a visitor wants
// to know is which kinds of track are missing and from which assembly, so
// aggregate on both. The per-track detail stays in the repo.
function summarizeRemovedTracks(tracks: RemovedTrack[]) {
  const byReason = new Map<
    string,
    { tracks: number; assemblies: Set<string> }
  >()
  const byAssembly = new Map<string, number>()
  for (const track of tracks) {
    const reason = byReason.get(track.reason) ?? {
      tracks: 0,
      assemblies: new Set<string>(),
    }
    reason.tracks += 1
    reason.assemblies.add(track.assembly)
    byReason.set(track.reason, reason)
    byAssembly.set(track.assembly, (byAssembly.get(track.assembly) ?? 0) + 1)
  }
  return {
    reasonRows: [...byReason].toSorted((a, b) => b[1].tracks - a[1].tracks),
    assemblyRows: [...byAssembly].toSorted((a, b) => b[1] - a[1]),
  }
}

// Both files are symlinks into ucsc2jbrowse/, where make.sh deletes them at the
// start of a run and mergeFileAccessCache.ts / mergeRemovedTracks.ts rewrite
// them at the end. A build inside that window renders the page with a note.
export function readUnavailableTracks(root: string) {
  const blocked = readCheckedJsonIfPresent(
    join(root, 'blockedFiles.json'),
    isRecordOf(isBlockedEntry),
  )
  const removed = readCheckedJsonIfPresent(
    join(root, 'removedTracks.json'),
    isArrayOf(isRemovedTrack),
  )
  const blockedDirectories =
    blocked === undefined ? [] : groupBlockedFiles(blocked)
  const removedTracks = removed ?? []
  return {
    blockedDirectories,
    blockedCount: blockedDirectories.reduce(
      (sum, group) => sum + group.files.length,
      0,
    ),
    removedCount: removedTracks.length,
    ...summarizeRemovedTracks(removedTracks),
    dataBeingRegenerated: blocked === undefined || removed === undefined,
  }
}
