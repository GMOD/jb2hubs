import fs from 'fs'
import path from 'path'

import {
  createStaticCatalog,
  isSyntenyCatalogData,
} from './src/lib/syntenyCatalog.ts'
import { readCheckedJson } from './src/utils/readJson.ts'

const INPUT_FILE = path.join(import.meta.dirname, 'src/syntenyTracks.json')
const OUTPUT_FILE = path.join(import.meta.dirname, 'src/syntenyAccessions.json')

const data = readCheckedJson(INPUT_FILE, isSyntenyCatalogData)

// The assembly names the /synteny selector lists — the same catalog query, so
// an accession page links to the selector exactly when the selector would
// offer that assembly. Names are whatever the track's config calls the genome:
// a GC[AF] accession for GenArk, the browser db (`hg38`) for UCSC, which is why
// the accession page tries its UCSC db name first.
const names = createStaticCatalog(data)
  .listAssemblies()
  .map(asm => asm.id)
  .toSorted()
// An empty list would quietly drop every accession page's synteny link.
if (names.length === 0) {
  throw new Error(
    `${INPUT_FILE} lists no synteny assemblies; refusing to write an empty ${OUTPUT_FILE}`,
  )
}
fs.writeFileSync(OUTPUT_FILE, JSON.stringify(names))
console.log(`Synteny accessions: ${names.length} entries`)
