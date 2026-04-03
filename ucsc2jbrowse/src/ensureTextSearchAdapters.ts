import fs from 'fs'
import path from 'path'

import { readJSON, writeJSON } from 'hubtools'

const resultsDir = process.argv[2]
if (!resultsDir) {
  console.error('Usage: node ensureTextSearchAdapters.ts <UCSC_BUILT_DIR>')
  process.exit(1)
}

let fixed = 0
let skipped = 0

for (const entry of fs.readdirSync(resultsDir, { withFileTypes: true })) {
  if (!entry.isDirectory() || entry.name === 'trix') {
    continue
  }

  const assemblyName = entry.name
  const configPath = path.join(resultsDir, assemblyName, 'config.json')
  const trixDir = path.join(resultsDir, assemblyName, 'trix')
  const ixPath = path.join(trixDir, `${assemblyName}.ix`)

  if (!fs.existsSync(configPath) || !fs.existsSync(ixPath)) {
    skipped++
    continue
  }

  const config = readJSON<Record<string, unknown>>(configPath)
  const existing = config.aggregateTextSearchAdapters as
    | { textSearchAdapterId?: string }[]
    | undefined

  const adapterId = `${assemblyName}-index`
  if (existing?.some(a => a.textSearchAdapterId === adapterId)) {
    continue
  }

  const adapter = {
    type: 'TrixTextSearchAdapter',
    textSearchAdapterId: adapterId,
    ixFilePath: {
      uri: `trix/${assemblyName}.ix`,
      locationType: 'UriLocation',
    },
    ixxFilePath: {
      uri: `trix/${assemblyName}.ixx`,
      locationType: 'UriLocation',
    },
    metaFilePath: {
      uri: `trix/${assemblyName}_meta.json`,
      locationType: 'UriLocation',
    },
    assemblyNames: [assemblyName],
  }

  config.aggregateTextSearchAdapters = [...(existing ?? []), adapter]

  writeJSON(configPath, config)
  fixed++
  console.log(`Fixed: ${assemblyName}`)
}

console.log(
  `\nEnsured text search adapters: ${fixed} fixed, ${skipped} skipped`,
)
