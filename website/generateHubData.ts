// Writes the compact per-category row files the hub tables fetch at runtime, so
// the pages themselves stay small. See src/components/DataTable/hubRow.ts for the
// format and why.
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

import {
  INLINE_ACCESSION_LIMIT,
  byCommonName,
  encodeHubRow,
  taxonAccessionsUrl,
} from './src/components/DataTable/hubRow.ts'
import {
  collectAccessions,
  parseTaxonomyNewick,
} from './src/utils/taxonomyCache.ts'

import type { HubSource } from './src/components/DataTable/hubRow.ts'
import type { TaxonomyNode } from './src/utils/taxonomyCache.ts'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const inputDir = path.join(__dirname, 'processedHubJson')
const publicDir = path.join(__dirname, 'public')
const outputDir = path.join(publicDir, 'hubData')

fs.mkdirSync(outputDir, { recursive: true })

for (const file of fs.readdirSync(inputDir)) {
  if (file.endsWith('.json') && file !== 'all.json') {
    const rows: HubSource[] = JSON.parse(
      fs.readFileSync(path.join(inputDir, file), 'utf-8'),
    )
    const encoded = rows
      .filter(row => row.accession)
      .sort(byCommonName)
      .map(encodeHubRow)
    const outputPath = path.join(outputDir, file)
    fs.writeFileSync(outputPath, JSON.stringify(encoded))
    const sizeMB = (fs.statSync(outputPath).size / 1e6).toFixed(2)
    console.log(`hubData/${file}: ${encoded.length} rows, ${sizeMB} MB`)
  }
}

// One accession list per taxon whose subtree is too large to inline into its
// /taxonomy page (see subtreeTable). The page names the file only if it exists,
// so a run without the taxonomy tree degrades to inlining rather than to a 404.
const newickPath = path.join(publicDir, 'taxonomy', 'all.newick')
const root = fs.existsSync(newickPath)
  ? parseTaxonomyNewick(fs.readFileSync(newickPath, 'utf-8'))
  : null
if (root) {
  const taxonDir = path.join(outputDir, 'taxon')
  fs.rmSync(taxonDir, { recursive: true, force: true })
  fs.mkdirSync(taxonDir)
  let written = 0
  let bytes = 0
  const seen = new Set<string>()
  const visit = (node: TaxonomyNode) => {
    const accessions = collectAccessions(node)
    if (
      node.taxonId &&
      !seen.has(node.taxonId) &&
      accessions.length > INLINE_ACCESSION_LIMIT
    ) {
      seen.add(node.taxonId)
      const file = path.join(publicDir, taxonAccessionsUrl(node.taxonId))
      fs.writeFileSync(file, JSON.stringify(accessions))
      written += 1
      bytes += fs.statSync(file).size
    }
    if (accessions.length > INLINE_ACCESSION_LIMIT) {
      for (const child of node.children ?? []) {
        visit(child)
      }
    }
  }
  visit(root)
  console.log(
    `hubData/taxon/: ${written} subtrees over ${INLINE_ACCESSION_LIMIT} accessions, ${(bytes / 1e6).toFixed(1)} MB`,
  )
} else {
  console.warn(
    `${newickPath} not found; large /taxonomy pages will inline their accession lists`,
  )
}
