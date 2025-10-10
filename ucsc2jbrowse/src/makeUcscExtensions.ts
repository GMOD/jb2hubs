import fs from 'fs'
import path from 'path'

import { dedupe } from './dedupe.ts'
import { readConfig, writeJSON } from './util.ts'

import type { JBrowseConfig } from './types.ts'

const BASE_EXTENSION_DIR = 'ucscExtensions'

function makeUcscExtensions(targetDir: string) {
  const extensionFiles = fs.readdirSync(BASE_EXTENSION_DIR)

  for (const item of extensionFiles) {
    const accession = item.replace('.json', '')
    const configFilePath = path.join(targetDir, accession, 'config.json')

    // Ensure directory structure exists for the target config file
    const dir = path.dirname(configFilePath)
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true })
    }

    let existingConfig: JBrowseConfig
    try {
      existingConfig = readConfig(configFilePath)
    } catch (e) {
      console.warn(
        `Could not read existing config for ${accession}. Creating a new one.`,
      )
      existingConfig = { assemblies: [], tracks: [] }
    }

    const extensionConfig = readConfig(path.join(BASE_EXTENSION_DIR, item))

    // Merge existing and extension configurations
    const mergedConfig: JBrowseConfig = {
      ...existingConfig,
      ...extensionConfig,
      assemblies: [
        {
          // this specifically mixes in properties of the assembly for
          // cytobands, seen in the ucscExtensions/hs1.json
          ...existingConfig.assemblies[0]!,
          ...(extensionConfig.assemblies[0] ?? {}),
        },
      ],
      tracks: dedupe(
        [
          ...extensionConfig.tracks.map(t => ({
            ...t,
            metadata: {
              ...t.metadata,
              addedByJBrowseTeam: true,
            },
          })),
          ...existingConfig.tracks,
        ],
        track => track.trackId,
      ),
      // Merge plugins if they exist
      plugins: dedupe(
        [...(extensionConfig.plugins ?? []), ...(existingConfig.plugins ?? [])],
        plugin => (plugin as { name: string }).name, // Assuming plugins have a 'name' property
      ),
      // Merge aggregateTextSearchAdapters if they exist
      aggregateTextSearchAdapters: dedupe(
        [
          ...(extensionConfig.aggregateTextSearchAdapters ?? []),
          ...(existingConfig.aggregateTextSearchAdapters ?? []),
        ],
        adapter =>
          (adapter as { textSearchAdapterId: string }).textSearchAdapterId, // Assuming adapters have a 'textSearchAdapterId' property
      ),
    }

    writeJSON(configFilePath, mergedConfig)
    console.log(`Updated config file: ${configFilePath}`)
  }
}

if (process.argv.length !== 3) {
  console.error('Usage: node makeUcscExtensions.ts <targetDirectory>')
  process.exit(1)
}

makeUcscExtensions(process.argv[2]!)
