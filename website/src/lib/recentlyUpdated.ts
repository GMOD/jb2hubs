import { genarkConfigPath, jbrowseUrl } from '../config/jbrowse.ts'

// Every field here is inlined into the page for each of the ~500 rows per
// category, so it holds only what the table shows. The three outbound links are
// all derivable from the accession.
export interface HubEntry {
  accession: string
  createdDate: string
  scientificName: string
  commonName: string
  source: string
}

const dateFormatter = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric',
  year: 'numeric',
})

export function formatDate(isoString: string): string {
  return dateFormatter.format(new Date(isoString))
}

// Ordered [href, label] pairs for the links cell, so the server render and the
// client re-render share one definition.
export function linkEntries(hub: HubEntry): [string, string][] {
  return [
    [jbrowseUrl(genarkConfigPath(hub.accession)), 'JBrowse'],
    [`https://genome.ucsc.edu/h/${hub.accession}`, 'UCSC'],
    [`https://www.ncbi.nlm.nih.gov/datasets/genome/${hub.accession}/`, 'NCBI'],
  ]
}
