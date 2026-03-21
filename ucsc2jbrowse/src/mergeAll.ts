/* eslint-disable no-console */
import fs from 'fs'
import path from 'path'

import { readConfig, writeJSON } from './util.ts'

import type { JBrowseConfig } from './types.ts'

const CONFIGS_BASE_DIR = 'configs'

/**
 * Recursively adds relative URIs to a JBrowse configuration object.
 * This function modifies the config object in place.
 * @param config The JBrowse configuration object or a part of it.
 * @param baseUrl The base URL to prepend to relative URIs.
 */
function addRelativeUris(
  config: Record<string, unknown> | null,
  baseUrl: string,
) {
  if (typeof config === 'object' && config !== null) {
    for (const key of Object.keys(config)) {
      if (typeof config[key] === 'object' && config[key] !== null) {
        // Recursively call for nested objects
        addRelativeUris(config[key] as Record<string, unknown>, baseUrl)
      } else if (key === 'uri' && typeof config[key] === 'string') {
        const uri = config[key]
        // Prepend base URL if the URI is relative
        if (!uri.startsWith('http') && !uri.startsWith('/')) {
          config[key] = `${baseUrl}/${uri}`
        }
      }
    }
  }
}

/**
 * Merges multiple JBrowse configuration files into a single 'all.json' file.
 * It reads all config.json files from the 'configs' directory, processes their URIs,
 * and combines their assemblies, tracks, and aggregate text search adapters.
 */
function mergeAllConfigs() {
  const configFiles = fs
    .readdirSync(CONFIGS_BASE_DIR)
    .filter(file => file.endsWith('.json'))

  const allConfigs: JBrowseConfig[] = configFiles.map(file => {
    const config = readConfig(path.join(CONFIGS_BASE_DIR, file))
    // Assuming the first assembly's name can be used as a base for relative URIs
    const assemblyName = config.assemblies[0]?.name
    if (assemblyName) {
      // @ts-expect-error
      addRelativeUris(config, assemblyName)
    }
    return config
  })

  const mergedPlugins = new Map<string, unknown>()
  for (const config of allConfigs) {
    if (config.plugins) {
      for (const plugin of config.plugins) {
        mergedPlugins.set(JSON.stringify(plugin), plugin)
      }
    }
  }

  const mergedConfig: JBrowseConfig = {
    assemblies: allConfigs
      .flatMap(config => config.assemblies)
      .filter(assembly => assembly.name),
    tracks: allConfigs.flatMap(config => config.tracks),
    aggregateTextSearchAdapters: allConfigs.flatMap(
      config => config.aggregateTextSearchAdapters ?? [],
    ),
    plugins: [...mergedPlugins.values()],
  }

  const ucscResultsDir = process.env.UCSC_BUILT_DIR
  if (!ucscResultsDir) {
    throw new Error('No UCSC_BUILT_DIR env defined')
  }
  writeJSON(path.join(ucscResultsDir, 'all.json'), mergedConfig)
  console.log(`All configurations merged into ${ucscResultsDir}/all.json`)
}

mergeAllConfigs()
