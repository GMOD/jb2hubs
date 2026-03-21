/* eslint-disable no-console */
import * as fs from 'fs'

import deepEqual from 'fast-deep-equal'
import {
  enhanceConfig,
  generateJBrowseConfigsForMultiGenomeHub,
  readJSON,
  writeJSON,
} from 'hubtools'

import { JAX_STRAIN_IDS, jaxUrl } from './jaxStrainIds.ts'

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
    const rawPath = `${outDir}/config.raw.json`
    let oldRaw: Record<string, unknown> = {}
    try {
      oldRaw = readJSON(rawPath) as Record<string, unknown>
    } catch {
      // Normal on first run
    }

    if (deepEqual(config, oldRaw)) {
      console.log(`Config for ${genomeName} is unchanged. Skipping write.`)
    } else {
      writeJSON(rawPath, config)
      writeJSON(configPath, config)
      enhanceConfig(configPath)
      console.log(`Generated config for ${genomeName} → ${configPath}`)
    }

    const strainSlash = genomeName.replaceAll('_', '/')
    const jaxId = JAX_STRAIN_IDS[strainSlash]
    const yearMatch = /(\d{4})/.exec(displayName)
    return {
      genomeName,
      organism,
      assemblyYear: yearMatch ? yearMatch[1] : null,
      jbrowseLink: `${JBROWSE_BASE}${CONFIG_BASE}/${genomeName}/config.json`,
      jaxUrl: jaxId ? jaxUrl(jaxId) : null,
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
