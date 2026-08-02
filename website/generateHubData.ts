// Writes the compact per-category row files the hub tables fetch at runtime, so
// the pages themselves stay small. See src/components/DataTable/hubRow.ts for the
// format and why.
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

import {
  byCommonName,
  encodeHubRow,
} from './src/components/DataTable/hubRow.ts'

import type { HubSource } from './src/components/DataTable/hubRow.ts'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const inputDir = path.join(__dirname, 'processedHubJson')
const outputDir = path.join(__dirname, 'public/hubData')

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
