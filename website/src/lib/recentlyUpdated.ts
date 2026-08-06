import { genarkConfigPath, jbrowseUrl } from '../config/jbrowse.ts'

// What the recently-updated table renders. The three outbound links are all
// derivable from the accession, so no row carries a URL.
export interface HubEntry {
  accession: string
  createdDate: string
  scientificName: string
  commonName: string
  source: string
}

// The wire shape of the generated src/recentlyUpdated.json: a rendered row plus
// the key it is ordered by. generateRecentlyUpdated.ts is the only writer and
// emits exactly these fields — it used to also carry a modified date and three
// baked-in URLs that nothing read, which was two thirds of a 31MB file — so a
// field added here has to be added there to exist at all.
export interface HubRecord extends HubEntry {
  createdTimestamp: number
}

const dateFormatter = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric',
  year: 'numeric',
})

export function formatDate(isoString: string): string {
  return dateFormatter.format(new Date(isoString))
}

// Ordered [href, label] pairs for the links cell.
export function linkEntries(hub: HubEntry): [string, string][] {
  return [
    [jbrowseUrl(genarkConfigPath(hub.accession)), 'JBrowse'],
    [`https://genome.ucsc.edu/h/${hub.accession}`, 'UCSC'],
    [`https://www.ncbi.nlm.nih.gov/datasets/genome/${hub.accession}/`, 'NCBI'],
  ]
}
