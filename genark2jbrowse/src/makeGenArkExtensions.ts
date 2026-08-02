import * as fs from 'fs'
import * as path from 'path'

import { dedupe, readJSON } from 'hubtools'

import { getHubBasePath } from './util.ts'

import type { JBrowseConfig } from 'hubtools'

/**
 * This script processes extension configuration files located in 'genArkExtensions/'
 * and merges them into the main JBrowse 2 config.json for each assembly hub.
 * It ensures that track IDs are deduplicated during the merge.
 */
function applyGenArkExtensions() {
  const extensionsDir = 'genArkExtensions'
  const extensionFiles = fs.readdirSync(extensionsDir)

  for (const item of extensionFiles) {
    const accession = item.replace('.json', '')
    const configFilePath = `${getHubBasePath(accession)}/config.json`

    // Ensure the directory structure exists for the config file
    const configDir = path.dirname(configFilePath)
    if (!fs.existsSync(configDir)) {
      fs.mkdirSync(configDir, { recursive: true })
    }

    try {
      const existingConfig = fs.existsSync(configFilePath)
        ? readJSON<JBrowseConfig>(configFilePath)
        : ({ tracks: [] } as JBrowseConfig)
      const extensionConfig = readJSON<JBrowseConfig>(
        path.join(extensionsDir, item),
      )

      // Add assembly prefix to extension track IDs
      const extensionTracksWithPrefix = (extensionConfig.tracks ?? []).map(
        track => ({
          ...track,
          trackId: `${accession}-${track.trackId}`,
        }),
      )

      // Merge the configurations. Extension tracks take precedence and are deduplicated.
      const mergedConfig = {
        ...existingConfig,
        ...extensionConfig,
        tracks: dedupe(
          [...extensionTracksWithPrefix, ...(existingConfig.tracks ?? [])],
          t => t.trackId,
        ),
      }

      // Write the merged configuration back to the config.json file
      fs.writeFileSync(
        configFilePath,
        JSON.stringify(mergedConfig, undefined, 2),
      )
      console.log(`Updated config file: ${configFilePath}`)
    } catch (error) {
      console.error(
        `Error processing extension for ${accession} at ${configFilePath}: ${error}`,
      )
    }
  }
}

applyGenArkExtensions()
