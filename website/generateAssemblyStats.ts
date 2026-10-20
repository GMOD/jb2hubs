// Writes every hosted assembly's contig N50, which the accession pages draw
// each assembly against. Reading 53K ncbi.json files takes about 20 s, so it
// runs once here rather than in getStaticPaths, where `astro dev` would redo it.
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

import { loadAccessionMap, loadNcbiDetails } from './src/utils/accessionData.ts'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const OUTPUT_FILE = path.join(__dirname, 'src/assemblyStats.json')

const contigN50: Record<string, number> = {}
for (const accession of loadAccessionMap().keys()) {
  const n50 = loadNcbiDetails(accession).stats?.contig_n50
  if (n50) {
    contigN50[accession] = n50
  }
}
const count = Object.keys(contigN50).length
if (count === 0) {
  throw new Error('No contig N50 found; is ../hubs populated?')
}
fs.writeFileSync(OUTPUT_FILE, JSON.stringify({ contigN50 }))
console.log(`Assembly stats: ${count} contig N50s`)
