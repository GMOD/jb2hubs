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

const BASE_URL = 'https://jbrowse.org/code/jb2/latest/?config='
const CONFIG_BASE = '/hubs/genark/mouseStrains'

console.log('Fetching mouseStrains hub...')
const configs = await generateJBrowseConfigsForMultiGenomeHub(
  MOUSE_STRAINS_HUB_URL,
)

const metadata: Array<{
  genomeName: string
  displayName: string
  organism: string
  defaultPos: string
  jbrowseLink: string
}> = []

for (const { genomeName, config } of configs) {
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

  const asm = (config.assemblies as Array<Record<string, unknown>>)[0]!
  const ucsc = (
    (asm.sequence as Record<string, unknown>).metadata as Record<
      string,
      unknown
    >
  ).ucsc as Record<string, string>

  metadata.push({
    genomeName,
    displayName: (asm.displayName as string) ?? genomeName,
    organism: ucsc.organism ?? '',
    defaultPos: ucsc.defaultPos ?? '',
    jbrowseLink: `${BASE_URL}${CONFIG_BASE}/${genomeName}/config.json`,
  })
}

const metaPath = '../website/src/mouseStrains.json'
fs.writeFileSync(metaPath, JSON.stringify(metadata, null, 2))
console.log(`Written ${metadata.length} entries to ${metaPath}`)
console.log(`Done: processed ${configs.length} mouse strain assemblies`)
