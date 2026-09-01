import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

import { ALL_SOURCES, createStaticCatalog } from './src/lib/syntenyCatalog.ts'

import type { SyntenyCatalogData } from './src/lib/syntenyCatalog.ts'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const INPUT_FILE = path.join(__dirname, 'src/syntenyTracks.json')
const OUTPUT_FILE = path.join(__dirname, 'src/syntenyAccessions.json')

const data: SyntenyCatalogData = JSON.parse(
  fs.readFileSync(INPUT_FILE, 'utf-8'),
)

// The assembly names the /synteny selector lists — the same catalog query, so
// an accession page links to the selector exactly when the selector would
// offer that assembly. Names are whatever the track's config calls the genome:
// a GC[AF] accession for GenArk, the browser db (`hg38`) for UCSC, which is why
// the accession page tries its UCSC db name first.
const names = createStaticCatalog(data)
  .listAssemblies(ALL_SOURCES)
  .map(asm => asm.id)
  .sort()
fs.writeFileSync(OUTPUT_FILE, JSON.stringify(names))
console.log(`Synteny accessions: ${names.length} entries`)
