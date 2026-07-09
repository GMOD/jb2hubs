export interface HubEntry {
  accession: string
  createdDate: string
  createdTimestamp: number
  scientificName: string
  commonName: string
  source: string
  jbrowseLink: string
  ncbiLink: string
  ucscBrowserLink: string
}

const dateFormatter = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric',
  year: 'numeric',
})

export function formatDate(isoString: string): string {
  return dateFormatter.format(new Date(isoString))
}

// Ordered [href, label] pairs for the links cell, omitting links that are absent
// so both the server render and the client re-render share one separator rule.
export function linkEntries(hub: HubEntry): [string, string][] {
  const entries: [string, string][] = []
  if (hub.jbrowseLink) {
    entries.push([hub.jbrowseLink, 'JBrowse'])
  }
  if (hub.ucscBrowserLink) {
    entries.push([hub.ucscBrowserLink, 'UCSC'])
  }
  if (hub.ncbiLink) {
    entries.push([hub.ncbiLink, 'NCBI'])
  }
  return entries
}
