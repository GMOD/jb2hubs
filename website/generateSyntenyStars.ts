import fs from 'fs'
import path from 'path'

import { isAssemblyIndex } from './src/components/orthologDb.ts'
import { isSyntenyCatalogData } from './src/lib/syntenyCatalog.ts'
import { starIndex } from './src/lib/syntenyStarIndex.ts'
import { readCheckedJson } from './src/utils/readJson.ts'

const inputPath = path.join(import.meta.dirname, 'src/syntenyTracks.json')
const orthologIndexPath = path.join(
  import.meta.dirname,
  'public/ortholog_index.json',
)
const outputPath = path.join(import.meta.dirname, 'public/synteny_stars.json')

if (!fs.existsSync(orthologIndexPath)) {
  throw new Error(
    `${orthologIndexPath} is missing; run \`pnpm generate-ortholog-index\` first (\`pnpm generate\` does both, in order)`,
  )
}
const data = readCheckedJson(inputPath, isSyntenyCatalogData)
const orthologIndex = readCheckedJson(orthologIndexPath, isAssemblyIndex)

// A gene page's reference opens /ucsc/<db>, so only those dbs need an entry
const stars = starIndex(data, new Set(Object.values(orthologIndex.ucscDb)))

if (Object.keys(stars).length === 0) {
  throw new Error(
    `no multi-way star found in ${inputPath}; refusing to write an empty ${outputPath}`,
  )
}

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
