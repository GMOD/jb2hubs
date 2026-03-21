/* eslint-disable no-console */
import * as fs from 'fs'

import deepEqual from 'fast-deep-equal'
import {
  generateJBrowseConfigsForMultiGenomeHub,
  readJSON,
  writeJSON,
} from 'hubtools'

const MOUSE_STRAINS_HUB_URL =
  'https://hgdownload.soe.ucsc.edu/hubs/mouseStrains/hub.txt'

const JBROWSE_BASE = 'https://jbrowse.org/code/jb2/latest/?config='
const CONFIG_BASE = '/hubs/genark/mouseStrains'

console.log('Fetching mouseStrains hub...')
const configs = await generateJBrowseConfigsForMultiGenomeHub(
  MOUSE_STRAINS_HUB_URL,
)

const metadata = configs.map(
  ({ genomeName, displayName, organism, defaultPos, config }) => {
    const outDir = `hubs/mouseStrains/${genomeName}`
    fs.mkdirSync(outDir, { recursive: true })

    const configPath = `${outDir}/config.json`
    let oldConfig: Record<string, unknown> = {}
    try {
      oldConfig = readJSON(configPath) as Record<string, unknown>
    } catch {
      // Normal on first run
    }

    if (deepEqual(config, oldConfig)) {
      console.log(`Config for ${genomeName} is unchanged. Skipping write.`)
    } else {
      writeJSON(configPath, config)
      console.log(`Generated config for ${genomeName} → ${configPath}`)
    }

    return {
      genomeName,
      displayName,
      organism,
      defaultPos,
      jbrowseLink: `${JBROWSE_BASE}${CONFIG_BASE}/${genomeName}/config.json`,
    }
  },
)

fs.writeFileSync(
  '../website/src/mouseStrains.json',
  JSON.stringify(metadata, null, 2),
)
console.log(
  `Written ${metadata.length} entries to ../website/src/mouseStrains.json`,
)
