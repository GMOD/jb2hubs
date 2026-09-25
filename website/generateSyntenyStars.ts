import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

import { starIndex } from './src/lib/syntenyStarIndex.ts'

import type { SyntenyCatalogData } from './src/lib/syntenyCatalog.ts'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const inputPath = path.join(__dirname, 'src/syntenyTracks.json')
const orthologIndexPath = path.join(__dirname, 'public/ortholog_index.json')
const outputPath = path.join(__dirname, 'public/synteny_stars.json')

if (!fs.existsSync(orthologIndexPath)) {
  throw new Error(
    `${orthologIndexPath} is missing; run \`pnpm generate-ortholog-index\` first (\`pnpm generate\` does both, in order)`,
  )
}
const data: SyntenyCatalogData = JSON.parse(fs.readFileSync(inputPath, 'utf-8'))
const orthologIndex: { ucscDb: Record<string, string> } = JSON.parse(
  fs.readFileSync(orthologIndexPath, 'utf-8'),
)

// A gene page's reference opens /ucsc/<db>, so only those dbs need an entry
const stars = starIndex(data, new Set(Object.values(orthologIndex.ucscDb)))

fs.mkdirSync(path.dirname(outputPath), { recursive: true })
fs.writeFileSync(outputPath, JSON.stringify(stars))
const sizeKB = (fs.statSync(outputPath).size / 1024).toFixed(0)
console.log(
  `Synteny stars: ${Object.keys(stars).length} references, ${sizeKB} KB (${Object.entries(
    stars,
  )
    .map(([anchor, lanes]) => `${anchor} ${Object.keys(lanes.taxa).length}`)
    .join(', ')} species)`,
)
