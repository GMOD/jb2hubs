import { jbrowseUrl, ucscConfigPath } from '../config/jbrowse.ts'
import generatedAliases from '../ucscAliases.json'
import { readUcscGenomes } from '../utils/hubListings.ts'
import { ucscBrowserUrl } from './externalLinks.ts'
import { releaseYear } from './releaseYear.ts'

import type { UcscRow } from '../components/UCSCTable.tsx'

// Typed as the global.d.ts declaration says, whether or not the generated file
// is there for tsc to read its literal keys instead.
const ucscAliases: Record<string, string[] | undefined> = generatedAliases

// The /ucsc table's rows, in UCSC's own order.
export function ucscRows(): UcscRow[] {
  return Object.entries(readUcscGenomes())
    .sort(([, a], [, b]) => a.orderKey - b.orderKey)
    .map(([key, val]) => ({
      name: key,
      scientificName: val.scientificName,
      organism: val.organism,
      aliases: ucscAliases[key] ?? [],
      description: val.description,
      year: releaseYear(val.description),
      jbrowseLink: jbrowseUrl(ucscConfigPath(key)),
      ucscLink: ucscBrowserUrl(key),
    }))
}
