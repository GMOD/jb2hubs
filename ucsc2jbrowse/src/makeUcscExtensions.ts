import fs from 'fs'
import path from 'path'

import { dedupe } from 'hubtools'

import { readConfig, readJSON, writeJSON } from './util.ts'

import type { ConfigExtension, JBrowseConfig } from './types.ts'

const BASE_EXTENSION_DIR = 'ucscExtensions'

function makeUcscExtensions(targetDir: string) {
  const extensionFiles = fs.readdirSync(BASE_EXTENSION_DIR)

  for (const item of extensionFiles) {
    const accession = item.replace('.json', '')
    const configFilePath = path.join(targetDir, accession, 'config.json')

    const dir = path.dirname(configFilePath)
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, {
        recursive: true,
      })
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

    // An extension is a patch, not a config: read it as one, or a tracks-only
    // extension file throws on `.assemblies[0]` and a file with no `tracks`
    // throws on `.tracks.map`. See ConfigExtension in types.ts.
    const extensionConfig = readJSON<ConfigExtension>(
      path.join(BASE_EXTENSION_DIR, item),
    )

    // Mixing the two together is what carries an extension's assembly-level
    // additions (the cytobands in ucscExtensions/hs1.json). An assembly with no
    // `name` is not a config with no assemblies, it is an assembly jbrowse
    // cannot load, so drop it and say so: spreading two absent assemblies used
    // to emit `[{}]`, and configs/renames.json is what that looked like once it
    // reached the tree and got merged into all.json.
    const mergedAssembly = {
      ...existingConfig.assemblies[0],
      ...extensionConfig.assemblies?.[0],
    }
    const { name: assemblyName } = mergedAssembly
    if (assemblyName === undefined) {
      console.warn(
        `${accession}: no named assembly in either the existing config or the extension; writing a config with no assemblies`,
      )
    }

    const mergedConfig: JBrowseConfig = {
      ...existingConfig,
      ...extensionConfig,
      assemblies:
        assemblyName === undefined
          ? []
          : [{ ...mergedAssembly, name: assemblyName }],
      tracks: (() => {
        const existingByTrackId = new Map(
          existingConfig.tracks.map(t => [t.trackId, t]),
        )
        const extensionTracks = (extensionConfig.tracks ?? []).map(t => {
          const existing = existingByTrackId.get(t.trackId)
          return {
            ...existing,
            ...t,
            metadata: {
              ...existing?.metadata,
              ...t.metadata,
              addedByJBrowseTeam: true,
            },
            ...(t.description || existing?.description
              ? { description: t.description ?? existing?.description }
              : {}),
          }
        })
        return dedupe(
          [...extensionTracks, ...existingConfig.tracks],
          track => track.trackId,
        )
      })(),
      plugins: dedupe(
        [...(extensionConfig.plugins ?? []), ...(existingConfig.plugins ?? [])],
        plugin => plugin.name,
      ),
      aggregateTextSearchAdapters: dedupe(
        [
          ...(extensionConfig.aggregateTextSearchAdapters ?? []),
          ...(existingConfig.aggregateTextSearchAdapters ?? []),
        ],
        adapter => adapter.textSearchAdapterId,
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
