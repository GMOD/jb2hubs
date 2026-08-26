import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

import { readConfig, writeJSON } from './util.ts'

import type { JBrowseConfig, JBrowsePlugin } from './types.ts'

const CONFIGS_BASE_DIR = 'configs'

// Keys whose string value is a file location. `chromSizes` is TwoBitAdapter's
// shorthand -- a bare string rather than a { uri } node -- so it needs naming
// here explicitly or the sidecar mirrored next to a config would resolve
// against /ucsc/ instead of /ucsc/<assembly>/ once merged.
const LOCATION_KEYS = new Set(['uri', 'chromSizes'])

/**
 * Recursively adds relative URIs to a JBrowse configuration object.
 * This function modifies the config object in place.
 * @param config The JBrowse configuration object or a part of it.
 * @param baseUrl The base URL to prepend to relative URIs.
 */
function addRelativeUris(node: unknown, baseUrl: string) {
  if (typeof node === 'object' && node !== null) {
    const obj = node as Record<string, unknown>
    for (const key of Object.keys(obj)) {
      const val = obj[key]
      if (typeof val === 'object' && val !== null) {
        addRelativeUris(val, baseUrl)
      } else if (LOCATION_KEYS.has(key) && typeof val === 'string') {
        if (!val.startsWith('http') && !val.startsWith('/')) {
          obj[key] = `${baseUrl}/${val}`
        }
      }
    }
  }
}

/**
 * The plugin list for the merged config, one entry per plugin NAME.
 *
 * Deduping on whole-object identity (the old `JSON.stringify(plugin)` key) made
 * two entries for the same plugin distinct whenever their urls differed, and
 * they routinely do: a config that has not been regenerated since the plugin
 * urls moved still names the old path. all.json ended up carrying every plugin
 * two or three times over -- the frozen v1 store path, `latest/`, and, via a
 * stale config that no regeneration reaches, unpkg.
 *
 * That is not a cosmetic duplicate. PluginLoader fetches all of them and each
 * bundle assigns the same `JBrowsePlugin<Name>` global, so the config asks the
 * app to install one plugin several times over. plugins[].url is the field that
 * error-pages a whole session rather than costing a single track, which is why
 * this dedupes rather than trusting every config in the tree to be current.
 *
 * The most current entry wins when a name appears more than once, ranked rather
 * than tested yes/no — because there are now three tiers, not two, and a plain
 * boolean let whichever of the top two was seen first keep the slot:
 *
 *   2. names `storePlugin`, so the host resolves the build for its own JBrowse
 *      version against the store manifest (jbrowse-plugin-list ADR 0008)
 *   1. names the `latest/` store path, which the store uploads no-cache so it
 *      keeps receiving publishes
 *   0. anything else — a frozen snapshot: the v1 store layout, or unpkg
 */
export function mergePlugins(configs: JBrowseConfig[]): JBrowsePlugin[] {
  const rank = (plugin: JBrowsePlugin) =>
    plugin.storePlugin !== undefined
      ? 2
      : (plugin.url?.includes('/latest/dist/') ?? false)
        ? 1
        : 0
  const merged = new Map<string, JBrowsePlugin>()
  for (const config of configs) {
    for (const plugin of config.plugins ?? []) {
      const existing = merged.get(plugin.name)
      if (!existing || rank(plugin) > rank(existing)) {
        merged.set(plugin.name, plugin)
      }
    }
  }
  return [...merged.values()]
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
      addRelativeUris(config, assemblyName)
    }
    return config
  })

  const mergedConfig: JBrowseConfig = {
    assemblies: allConfigs
      .flatMap(config => config.assemblies)
      .filter(assembly => assembly.name),
    tracks: allConfigs.flatMap(config => config.tracks),
    aggregateTextSearchAdapters: allConfigs.flatMap(
      config => config.aggregateTextSearchAdapters ?? [],
    ),
    plugins: mergePlugins(allConfigs),
  }

  const ucscResultsDir = process.env.UCSC_BUILT_DIR
  if (!ucscResultsDir) {
    throw new Error('No UCSC_BUILT_DIR env defined')
  }
  writeJSON(path.join(ucscResultsDir, 'all.json'), mergedConfig)
  console.log(`All configurations merged into ${ucscResultsDir}/all.json`)
}

// same guard as createMinimalConfig.ts, so mergePlugins can be imported and
// tested without the CLI running (and reading ./configs) on import
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  mergeAllConfigs()
}
