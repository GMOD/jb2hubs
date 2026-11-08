// Build-time only: this pulls in the whole of recentlyUpdated.json, so it must
// never be reachable from a client island. The formatting helpers that *are*
// shared with rendered markup live in ./recentlyUpdated.ts.

import {
  checked,
  isArrayOf,
  isNumber,
  isOptional,
  isShape,
  isString,
} from 'hubtools/guards'

import recentlyUpdated from '../recentlyUpdated.json'
import { PER_CATEGORY } from './recentlyUpdated.ts'

import type { HubEntry, HubRecord } from './recentlyUpdated.ts'
import type { Guard } from 'hubtools/guards'

// The pseudo-category for "everything, newest first".
export const ALL = 'all'

// Newest first, as generateRecentlyUpdated.ts writes it
const isHubRecord: Guard<HubRecord> = isShape({
  accession: isString,
  createdDate: isString,
  scientificName: isString,
  commonName: isString,
  source: isString,
  taxonId: isNumber,
  seqReleaseDate: isOptional(isString),
  assemblyStatus: isOptional(isString),
  createdTimestamp: isNumber,
})

const sorted = checked(
  recentlyUpdated,
  isArrayOf(isHubRecord),
  'recentlyUpdated.json',
)

export const categories = [...new Set(sorted.map(h => h.source))].toSorted()

export function recentFor(category: string): HubEntry[] {
  const rows =
    category === ALL ? sorted : sorted.filter(h => h.source === category)
  return rows.slice(0, PER_CATEGORY)
}
