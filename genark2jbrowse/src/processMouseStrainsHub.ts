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
const SITE = 'https://jbrowse.org'

// The strains this hub builds a config for, plus the two UCSC dbs the cactus
// alignment includes but the hub does not host (mm10, rn6 have no twoBitPath in
// its genomes file, so generateJBrowseConfigsForMultiGenomeHub skips them and
// ucsc2jbrowse publishes them instead).
const UCSC_SPECIES = new Set(['mm10', 'rn6'])

// Every row of the MAF is one of this hub's own strains or one of those two, so
// the alignment's `speciesOrder` resolves exactly — the sample ids ARE the
// assembly names. Absolute, because a strain's config sits under a sibling
// directory of the one being written, not under it.
function resolveSampleAssembly(sampleId: string) {
  const uri = UCSC_SPECIES.has(sampleId)
    ? `${SITE}/ucsc/${sampleId}/config.json`
    : `${SITE}${CONFIG_BASE}/${sampleId}/config.json`
  return {
    assemblyName: sampleId,
    assemblyConfigLocation: { uri, locationType: 'UriLocation' as const },
  }
}

console.log('Fetching mouseStrains hub...')
const configs = await generateJBrowseConfigsForMultiGenomeHub(
  MOUSE_STRAINS_HUB_URL,
  { resolveSampleAssembly },
)

const metadata = configs.map(
  ({ genomeName, displayName, organism, defaultPos: _defaultPos, config }) => {
    const outDir = `hubs/mouseStrains/${genomeName}`
    fs.mkdirSync(outDir, { recursive: true })

    const configPath = `${outDir}/config.json`
    const rawPath = `${outDir}/config.raw.json`
    let oldRaw: Record<string, unknown> = {}
    try {
      oldRaw = readJSON(rawPath)
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
