import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

import {
  buildUcscMapping,
  loadAccessionMap,
} from './src/utils/accessionData.ts'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

// searchIndex entry: [accession, commonName, scientificName, assemblyName, assemblyStatus, source, taxonId, ncbiStatus]
type SearchEntry = [
  string,
  string,
  string,
  string,
  string,
  string,
  number,
  number,
]

const searchIndex: SearchEntry[] = JSON.parse(
  fs.readFileSync(path.join(__dirname, 'public/searchIndex.json'), 'utf-8'),
)

const outputPath = path.join(__dirname, 'public/ortholog_index.json')

// UCSC-native assemblies (human/hg38, mouse/mm39, …) get their browser db baked
// in so the client can launch the curated /ucsc/<db> config instead of the
// GenArk-sharded config, whose sequence data 404s for these genomes.
const ucscMapping = buildUcscMapping(loadAccessionMap())

// The file answers two questions and deliberately nothing else: do we host this
// accession, and does UCSC serve it natively. Species names used to live here
// too — 44,685 of them, 84% of the bytes — and every NCBI ortholog report
// already names its own row's species (`taxname`/`common_name`) in cleaner form,
// with no trailing assembly parenthetical to strip. See orthologDb.ts.
//
// Only GCF (RefSeq) assemblies appear in NCBI ortholog API responses.
const accessions: string[] = []
const ucscDb: Record<string, string> = {}
for (const entry of searchIndex) {
  const accession = entry[0]
  if (accession.startsWith('GCF_')) {
    accessions.push(accession)
    const db = ucscMapping.get(accession)
    if (db) {
      ucscDb[accession] = db
    }
  }
}

// Sorted for the compressor, not for the reader: nothing downstream depends on
// the order (createStore builds a Set and picks the newest version explicitly),
// and neighbouring accessions then share long prefixes — 125 KB gzipped against
// 167 KB in searchIndex order, for the same 787 KB of JSON.
accessions.sort()

fs.writeFileSync(
  outputPath,
  JSON.stringify({ schema: 'ortholog-index/2', accessions, ucscDb }),
)

const sizeKB = (fs.statSync(outputPath).size / 1024).toFixed(0)
console.log(
  `Ortholog index: ${accessions.length} GCF assemblies ` +
    `(${Object.keys(ucscDb).length} UCSC-native), ${sizeKB} KB`,
)
