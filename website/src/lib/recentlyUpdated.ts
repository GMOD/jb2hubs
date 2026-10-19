import { genarkConfigPath, jbrowseUrl } from '../config/jbrowse.ts'
import { ncbiGenomeUrl, ucscGenArkUrl } from './externalLinks.ts'

// What the recently-updated table renders. The three outbound links are all
// derivable from the accession, so no row carries a URL.
export interface HubEntry {
  accession: string
  createdDate: string
  scientificName: string
  commonName: string
  source: string
  taxonId: number
  seqReleaseDate?: string
  assemblyStatus?: string
}

// The wire shape of the generated src/recentlyUpdated.json: a rendered row plus
// the key it is ordered by. generateRecentlyUpdated.ts is the only writer and
// emits exactly these fields, so a field added here has to be added there to
// exist at all.
export interface HubRecord extends HubEntry {
  createdTimestamp: number
}

// The rows each category's page shows, and so the most the generator writes
// per category
export const PER_CATEGORY = 500

// In UTC, the zone hubFirstSeen.json records in: the build host's Pacific time
// put a hub first seen in the first seven or eight hours of a UTC day on the
// day before.
const dateFormatter = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric',
  year: 'numeric',
  timeZone: 'UTC',
})

export function formatDate(isoString: string): string {
  return dateFormatter.format(new Date(isoString))
}

// Ordered [href, label] pairs for the links cell.
export function linkEntries(hub: HubEntry): [string, string][] {
  return [
    [jbrowseUrl(genarkConfigPath(hub.accession)), 'JBrowse'],
    [ucscGenArkUrl(hub.accession), 'UCSC'],
    [ncbiGenomeUrl(hub.accession), 'NCBI'],
  ]
}
