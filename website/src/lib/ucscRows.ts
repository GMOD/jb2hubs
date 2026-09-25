import { jbrowseUrl, ucscConfigPath } from '../config/jbrowse.ts'
import list from '../list.json'
import generatedAliases from '../ucscAliases.json'
import { ucscBrowserUrl } from './externalLinks.ts'

import type { UcscRow } from '../components/UCSCTable.tsx'

// Typed as the global.d.ts declaration says, whether or not the generated file
// is there for tsc to read its literal keys instead.
const ucscAliases: Record<string, string[] | undefined> = generatedAliases

// The /ucsc table's rows, in UCSC's own order.
export function ucscRows(): UcscRow[] {
  return Object.entries(list.ucscGenomes)
    .sort(([, a], [, b]) => a.orderKey - b.orderKey)
    .map(([key, val]) => ({
      name: key,
      scientificName: val.scientificName,
      organism: val.organism,
      aliases: ucscAliases[key] ?? [],
      description: val.description,
      year: Number(/\b(?:19|20)\d{2}\b/.exec(val.description)?.[0] ?? 0),
      jbrowseLink: jbrowseUrl(ucscConfigPath(key)),
      ucscLink: ucscBrowserUrl(key),
    }))
}
