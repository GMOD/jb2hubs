/* eslint-disable no-console */
import * as fs from 'fs'
import * as path from 'path'

import { dedupe, readJSON } from 'hubtools'

interface JBrowseConfig {
  tracks: { trackId: string; [key: string]: unknown }[]
  [key: string]: unknown
}

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
    const [base, rest] = accession.split('_')
    const [b1, b2, b3] = rest!.match(/.{1,3}/g)!
    const configFilePath = `hubs/${base}/${b1}/${b2}/${b3}/${accession}/config.json`

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
      const extensionTracksWithPrefix = extensionConfig.tracks.map(track => ({
        ...track,
        trackId: `${accession}-${track.trackId}`,
      }))

      // Merge the configurations. Extension tracks take precedence and are deduplicated.
      const mergedConfig = {
        ...existingConfig,
        ...extensionConfig,
        tracks: dedupe(
          [...extensionTracksWithPrefix, ...existingConfig.tracks],
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
