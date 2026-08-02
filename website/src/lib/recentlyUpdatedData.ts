// Build-time only: this pulls in the 31MB recentlyUpdated.json, so it must never
// be reachable from a client island. The formatting helpers that *are* shared
// with rendered markup live in ./recentlyUpdated.ts.

import recentlyUpdated from '../recentlyUpdated.json'

import type { HubEntry } from './recentlyUpdated.ts'

export const PER_CATEGORY = 500

// The pseudo-category for "everything, newest first".
export const ALL = 'all'

interface RawHub extends HubEntry {
  createdTimestamp: number
}

// Sorted newest-first once per build and reused by every category page, rather
// than re-sorting ~50K rows for each of the fourteen.
const sorted = (recentlyUpdated as RawHub[]).toSorted(
  (a, b) => b.createdTimestamp - a.createdTimestamp,
)

export const categories = [...new Set(sorted.map(h => h.source))].sort()

export function recentFor(category: string): HubEntry[] {
  const rows =
    category === ALL ? sorted : sorted.filter(h => h.source === category)
  return rows.slice(0, PER_CATEGORY)
}
