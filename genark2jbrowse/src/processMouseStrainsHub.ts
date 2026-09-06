import * as fs from 'fs'

import {
  enhanceConfigObject,
  generateJBrowseConfigsForMultiGenomeHub,
  readJSON,
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

// Writes only when the text moved, so an unchanged run leaves the file (and its
// mtime) alone. The trailing newline is what `pnpm format` leaves on these two
// files, and writing without one would make the formatter rewrite all 32 of
// them after every run.
function writeJsonIfChanged(file: string, data: unknown) {
  const text = `${JSON.stringify(data, undefined, 2)}\n`
  let existing = ''
  try {
    existing = fs.readFileSync(file, 'utf8')
  } catch {
    // normal on first run
  }
  if (text === existing) {
    return false
  }
  fs.writeFileSync(file, text)
  return true
}

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

    // config.raw.json records what the hub itself produced, and is what says
    // whether the hub moved. config.json is rebuilt from it only then --
    // createMouseStrainsChainTracks.ts appends the mm10 assembly and the
    // synteny tracks to config.json afterwards, so rewriting it unconditionally
    // would drop those every run.
    const configPath = `${outDir}/config.json`
    const rawPath = `${outDir}/config.raw.json`
    const rawChanged = writeJsonIfChanged(rawPath, config)
    if (rawChanged || !fs.existsSync(configPath)) {
      writeJsonIfChanged(configPath, config)
    }

    // Enhance runs over whatever is on disk, on EVERY run, not only when the
    // hub changed. It is idempotent, so an unchanged config is not rewritten --
    // but a change to what enhance adds now reaches a config whose hub has not
    // moved. That was the gap: the enhance pass sat inside the raw-equality
    // branch, the mouseStrains hub changes very rarely, and Phase 5 is
    // additionally gated on a 30-day stamp. Measured 2026-09-06, all 16 of
    // these configs name the three store plugins with `name` and `url` only,
    // while every GenArk hub carries the `storePlugin` ref a host resolves its
    // own build through. Same failure enhanceConfigObject's upsert-by-name
    // fixed one level down, reintroduced by the caller not calling it at all;
    // check-plugin-urls globs these files but asks whether a url resolves, not
    // whether the entry is current.
    const enhanced = writeJsonIfChanged(
      configPath,
      enhanceConfigObject(readJSON(configPath)),
    )
    console.log(
      rawChanged || enhanced
        ? `Generated config for ${genomeName} → ${configPath}`
        : `Config for ${genomeName} is unchanged. Skipping write.`,
    )

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
