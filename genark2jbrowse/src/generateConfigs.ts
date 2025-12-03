/* eslint-disable no-console */
import * as fs from 'fs'

import deepEqual from 'fast-deep-equal'
import {
  generateJBrowseConfigForAssemblyHub,
  readJSON,
  writeJSON,
} from 'hubtools'

/**
 * This script generates a JBrowse 2 config.json for an assembly hub.
 * It reads the hub's meta.json and hub.txt, then uses hubtools to generate
 * the JBrowse 2 configuration. If the new config is different from the old one,
 * it writes the new config to config.json.
 *
 * Usage: node generateConfigs.ts <path_to_meta.json>
 */

const metaPath = process.argv[2]

if (!metaPath) {
  console.error('Usage: node generateConfigs.ts <path_to_meta.json>')
  process.exit(1)
}

const configPath = metaPath.replace('meta.json', 'config.json')

let hubMeta: { hubFileLocation: string }
try {
  hubMeta = readJSON(metaPath) as { hubFileLocation: string }
} catch (error) {
  console.error(error)
  process.exit(1)
}

let oldConfig: Record<string, unknown> = {}
try {
  oldConfig = readJSON(configPath) as Record<string, unknown>
} catch (error) {
  // It's normal for config.json not to exist on the first run
  console.warn(
    `Could not read existing config.json at ${configPath}, will create new one (${error})`,
  )
}

let hubFileText: string
try {
  hubFileText = fs.readFileSync(
    metaPath.replace('meta.json', 'hub.txt'),
    'utf8',
  )
} catch (error) {
  console.error(`Error reading hub.txt for ${metaPath}: ${error}`)
  process.exit(1)
}

const newConfig = await generateJBrowseConfigForAssemblyHub({
  hubFileText,
  trackDbUrl: hubMeta.hubFileLocation,
})

// Remove Chain/Net tracks (legacy UCSC chain/net tracks)
// These are replaced by our new synteny tracks using PIF format
if (newConfig.tracks && newConfig.tracks.length > 0) {
  const originalTrackCount = newConfig.tracks.length
  newConfig.tracks = newConfig.tracks.filter(
    (track: any) => !track.name?.includes('Chain/Net'),
  )
  const removedCount = originalTrackCount - newConfig.tracks.length
  if (removedCount > 0) {
    console.log(`Removed ${removedCount} Chain/Net tracks from ${metaPath}`)
  }
}

// Compare new and old configurations. If they are identical, skip writing to avoid
// unnecessary file writes and subsequent text indexing.
if (deepEqual(newConfig, oldConfig)) {
  console.log(`Config for ${metaPath} is unchanged. Skipping write.`)
} else {
  // console.log(`Config for ${metaPath} has changed. Writing new config.json.`)
  writeJSON(configPath, newConfig)
}
