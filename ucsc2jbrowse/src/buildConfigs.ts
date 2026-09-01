// One pass per assembly: every step below runs against an in-memory config and
// the runner writes config.json, minimal.json and config-staging.json once
// each, only when the text differs from what is on disk. Every assembly the
// UCSC genome list names is rebuilt on every run, from the derived files the
// earlier phases left beside it; the whole walk is seconds, and it is what
// makes a converter change reach every config without a stamp deciding to.
//
// The order is the order the steps used to run as separate read-modify-write
// passes, because that order is what every published config's key order is.
// The adjacencies that are load-bearing:
//
// - the tabix adders before removeOutdatedTracks, which prunes what they add
// - addNcbiRefSeqGffTrack before ensureTextSearchAdapters, which decides
//   whether the assembly's index covers that track and is current
// - addMetadata before addOrigAssemblyToTrackName and rewriteUcscTrackNames,
//   which read the names and metadata it sets
// - enhance before dropGlobTracks and the finalize tail, as before
// - ensureAssemblyAliasesAndCytobands MUST precede mirrorAssemblySidecars,
//   which mirrors the refNameAliases and cytobands urls the first one adds
// - generateDefaultSessions MUST precede minimalConfig: the minimal config
//   keeps whatever gene track the defaultSession opens, and derives that
//   exception from the session rather than restating the priority list
//
// Usage: node buildConfigs.ts <UCSC_BUILT_DIR> <UCSC_DOWNLOADS_DIR> [--out-root <dir>]
//
//   --out-root <dir>   write the three files under <dir>/<db>/ instead of in
//                      place, and touch nothing else (no hard links, no
//                      report files): for comparing a build against the tree.
//
// Prints "<dir>\t<trackIds>" for each assembly whose text index needs
// (re)building; textIndex.sh consumes that. Everything else goes to stderr.
import fs from 'fs'
import path from 'path'

import {
  enhanceConfigObject,
  formatJson,
  generateJBrowseConfigForAssemblyHub,
  mapWithConcurrency,
  myfetchtextWithRetry,
  stagingEnhanceOptions,
} from 'hubtools'

import { addGeneticCodes, prefetchMitoCodes } from './addGeneticCodes.ts'
import { addMetadata } from './addMetadata.ts'
import { addNcbiRefSeqGffTrack } from './addNcbiRefSeqGffTrack.ts'
import { addOrigAssemblyToTrackName } from './addOrigAssemblyToTrackName.ts'
import { addDerivedTabixTracks } from './addTabixTrackToConfig.ts'
import { createAssemblyConfig } from './createAssembly.ts'
import { addChainTracks } from './createChainTracks.ts'
import { minimalConfig } from './createMinimalConfig.ts'
import { dropGlobTracks } from './dropGlobTracks.ts'
import { ensureAssemblyAliasesAndCytobands } from './ensureAssemblyAliasesAndCytobands.ts'
import {
  ensureTextSearchAdapters,
  textIndexPlan,
} from './ensureTextSearchAdapters.ts'
import { ensureUcscAssemblyNames } from './ensureUcscAssemblyNames.ts'
import { addGencodeTracks } from './gencodeTracks.ts'
import { generateDefaultSessions } from './generateDefaultSessions.ts'
import { applyUcscExtension, readUcscExtension } from './makeUcscExtensions.ts'
import { addBigDataTracks } from './mergeBigFileTracks.ts'
import { mirrorAssemblySidecars } from './mirrorAssemblySidecars.ts'
import { removeOutdatedTracks } from './removeEverythingButLatest.ts'
import { rewriteUcscTrackNames } from './rewriteUcscTrackNames.ts'
import { readJSON, requireArg } from './util.ts'

import type {
  JBrowseConfig,
  TrackDbEntry,
  UcscGenome,
  UcscGenomeList,
} from './types.ts'
import type { FinalizeContext, FinalizeStep } from './utils/finalizeStep.ts'

const args = process.argv.slice(2)
const outRootIndex = args.indexOf('--out-root')
const outRoot = outRootIndex === -1 ? undefined : args[outRootIndex + 1]
if (outRootIndex !== -1) {
  if (!outRoot) {
    console.error('--out-root needs a directory')
    process.exit(1)
  }
  args.splice(outRootIndex, 2)
}
const builtDir = requireArg(args[0], 'UCSC_BUILT_DIR is required')
const downloadsDir = requireArg(args[1], 'UCSC_DOWNLOADS_DIR is required')

const { ucscGenomes } = readJSON<UcscGenomeList>(
  path.join(builtDir, 'list.json'),
)

// The hub.txt of a hub-backed entry, derived from its nibPath rather than
// assumed from the assembly name: most UCSC assembly hubs live at
// /gbdb/<db>/hubs/public/hub.txt, but a GenArk-backed alias (rn8) has nibPath
// hub:/gbdb/genark/<GC[AF] path> and its hub is served from /hubs/<path>/hub.txt.
function hubUrl(genome: UcscGenome) {
  const { nibPath } = genome
  if (typeof nibPath !== 'string' || !nibPath.startsWith('hub:')) {
    return undefined
  }
  const hubPath = nibPath.slice('hub:'.length)
  return hubPath.startsWith('/gbdb/genark/')
    ? `https://hgdownload.soe.ucsc.edu/hubs/${hubPath.slice('/gbdb/genark/'.length)}/hub.txt`
    : `https://hgdownload.soe.ucsc.edu${hubPath}/public/hub.txt`
}

function ucscOrganism(db: string) {
  return ucscGenomes[db]?.organism ?? ''
}

const step = (
  name: string,
  run: (ctx: FinalizeContext) => void | Promise<void>,
): FinalizeStep => ({
  name,
  run: async ctx => {
    await run(ctx)
    return {}
  },
})

// Golden-path assemblies only: the hub ones arrive with their tracks.
const GOLDEN_PATH_STEPS: FinalizeStep[] = [
  step('big-file tracks', async ({ config, tracksDb, dbDir }) => {
    if (tracksDb) {
      await addBigDataTracks({ config, tracksDb, dbDir })
    }
  }),
  step('derived tabix tracks', ({ config, dir }) => {
    addDerivedTabixTracks(config, dir)
  }),
  step('outdated track versions', ({ config }) => {
    removeOutdatedTracks(config)
  }),
]

const STEPS: FinalizeStep[] = [
  step('extensions', ctx => {
    const extension = readUcscExtension(ctx.assemblyName)
    if (extension) {
      ctx.config = applyUcscExtension(ctx.assemblyName, ctx.config, extension)
    }
  }),
  addNcbiRefSeqGffTrack,
  ensureTextSearchAdapters,
  addChainTracks(ucscOrganism),
  addMetadata,
  addOrigAssemblyToTrackName,
  rewriteUcscTrackNames,
  step('enhance', ({ config }) => {
    enhanceConfigObject(config)
  }),
  addGeneticCodes,
  addGencodeTracks,
  dropGlobTracks,
  ensureAssemblyAliasesAndCytobands,
  mirrorAssemblySidecars,
  ensureUcscAssemblyNames,
  generateDefaultSessions,
]

// Everything the genome list names that can be built: a hub entry, or a
// golden-path one whose database/ has been rsynced.
const names = Object.keys(ucscGenomes)
  .filter(name => {
    const genome = ucscGenomes[name]!
    return (
      hubUrl(genome) !== undefined ||
      fs.existsSync(path.join(downloadsDir, name, name, 'database'))
    )
  })
  .sort()

const mitoCache = await prefetchMitoCodes(
  path.join(import.meta.dirname, '..', '.mitoCodes.json'),
  names.flatMap(name => {
    const { taxId } = ucscGenomes[name]!
    return typeof taxId === 'number' ? [taxId] : []
  }),
)

function writeIfChanged(file: string, content: unknown) {
  const text = formatJson(content)
  let existing = ''
  try {
    existing = fs.readFileSync(file, 'utf8')
  } catch {}
  if (text !== existing) {
    fs.mkdirSync(path.dirname(file), { recursive: true })
    fs.writeFileSync(file, text)
    return 1
  }
  return 0
}

async function baseConfig(
  assemblyName: string,
  genome: UcscGenome,
  dbDir: string,
): Promise<JBrowseConfig> {
  const hub = hubUrl(genome)
  if (hub) {
    const hubFileText = await myfetchtextWithRetry(hub)
    const config = generateJBrowseConfigForAssemblyHub({
      hubFileText,
      trackDbUrl: hub,
    })
    return { ...config, assemblies: config.assemblies, tracks: config.tracks }
  }
  return createAssemblyConfig({ assemblyName, dbDir, genome })
}

const totals = new Map<string, Map<string, number>>()
const failures: string[] = []
let written = 0
const needsIndex: string[] = []

// Low concurrency on purpose: the network here is hub.txt fetches, 2bit and
// bigDataUrl probes on a cold cache, and chromAlias mirroring, and hgdownload
// drops connections under bursts.
await mapWithConcurrency(names, 4, async assemblyName => {
  const genome = ucscGenomes[assemblyName]!
  const dir = path.join(builtDir, assemblyName)
  const dbDir = path.join(downloadsDir, assemblyName, assemblyName, 'database')
  const tracksJson = path.join(dir, 'tracks.json')
  try {
    const ctx: FinalizeContext = {
      assemblyName,
      dir,
      dbDir,
      genome,
      tracksDb: fs.existsSync(tracksJson)
        ? readJSON<Record<string, TrackDbEntry>>(tracksJson)
        : undefined,
      mitoCache,
      compareOnly: outRoot !== undefined,
      config: await baseConfig(assemblyName, genome, dbDir),
    }
    const steps = hubUrl(genome) ? STEPS : [...GOLDEN_PATH_STEPS, ...STEPS]
    for (const s of steps) {
      const counts = await s.run(ctx)
      let perStep = totals.get(s.name)
      if (!perStep) {
        perStep = new Map()
        totals.set(s.name, perStep)
      }
      for (const [label, n] of Object.entries(counts)) {
        perStep.set(label, (perStep.get(label) ?? 0) + n)
      }
    }

    const outDir = outRoot ? path.join(outRoot, assemblyName) : dir
    written += writeIfChanged(path.join(outDir, 'config.json'), ctx.config)
    written += writeIfChanged(
      path.join(outDir, 'minimal.json'),
      minimalConfig(ctx.config),
    )
    // The staging sibling: the same config plus what only
    // staging.genomes.jbrowse.org gets. A sibling file rather than a parallel
    // tree, because a UCSC config names most of its data relatively and
    // jbrowse-web resolves those against the config's own url.
    written += writeIfChanged(
      path.join(outDir, 'config-staging.json'),
      enhanceConfigObject(structuredClone(ctx.config), stagingEnhanceOptions),
    )

    const plan = textIndexPlan(ctx)
    if (plan.needsIndex) {
      needsIndex.push(`${dir}\t${plan.tracks.join(',')}`)
    }
  } catch (e) {
    failures.push(assemblyName)
    console.error(`Error building ${assemblyName}:`, e)
  }
})

for (const line of needsIndex) {
  console.log(line)
}

console.warn(
  `\nBuilt ${names.length - failures.length} of ${names.length} configs, ${written} file(s) written, ${needsIndex.length} to text-index`,
)
for (const s of [...GOLDEN_PATH_STEPS, ...STEPS]) {
  const perStep = [...(totals.get(s.name) ?? new Map<string, number>())]
  if (perStep.length > 0) {
    console.warn(
      `  ${s.name}: ${perStep.map(([label, n]) => `${n} ${label}`).join(', ')}`,
    )
  }
}

if (failures.length > 0) {
  console.error(`\nFailed to build: ${failures.join(', ')}`)
  process.exit(1)
}
