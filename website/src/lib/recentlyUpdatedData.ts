// Build-time only: this pulls in the whole of recentlyUpdated.json (11MB), so it
// must never be reachable from a client island. The formatting helpers that *are*
// shared with rendered markup live in ./recentlyUpdated.ts.

import recentlyUpdated from '../recentlyUpdated.json'

import type { HubEntry, HubRecord } from './recentlyUpdated.ts'

export const PER_CATEGORY = 500

// The pseudo-category for "everything, newest first".
export const ALL = 'all'

// The generator emits newest-first already; re-sorted here so that stays a
// property of this module rather than of whoever last edited the generator.
// Done once per build and reused by every category page, rather than re-sorting
// ~50K rows for each of the thirteen.
const sorted = (recentlyUpdated as HubRecord[]).toSorted(
  (a, b) => b.createdTimestamp - a.createdTimestamp,
)

export const categories = [...new Set(sorted.map(h => h.source))].sort()

export function recentFor(category: string): HubEntry[] {
  const rows =
    category === ALL ? sorted : sorted.filter(h => h.source === category)
  return rows.slice(0, PER_CATEGORY)
}
