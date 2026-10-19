// Build-time only: this pulls in the whole of recentlyUpdated.json, so it must
// never be reachable from a client island. The formatting helpers that *are*
// shared with rendered markup live in ./recentlyUpdated.ts.

import recentlyUpdated from '../recentlyUpdated.json'
import { PER_CATEGORY } from './recentlyUpdated.ts'

import type { HubEntry, HubRecord } from './recentlyUpdated.ts'

// The pseudo-category for "everything, newest first".
export const ALL = 'all'

// Newest first, as generateRecentlyUpdated.ts writes it
const sorted = recentlyUpdated as HubRecord[]

export const categories = [...new Set(sorted.map(h => h.source))].sort()

export function recentFor(category: string): HubEntry[] {
  const rows =
    category === ALL ? sorted : sorted.filter(h => h.source === category)
  return rows.slice(0, PER_CATEGORY)
}
