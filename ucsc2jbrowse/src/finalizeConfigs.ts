import fs from 'fs'
import path from 'path'

import { mapWithConcurrency } from 'hubtools'

import { createMinimalConfig } from './createMinimalConfig.ts'
import { dropGlobTracks } from './dropGlobTracks.ts'
import { ensureAssemblyAliasesAndCytobands } from './ensureAssemblyAliasesAndCytobands.ts'
import { ensureTextSearchAdapters } from './ensureTextSearchAdapters.ts'
import { ensureUcscAssemblyNames } from './ensureUcscAssemblyNames.ts'
import { generateDefaultSessions } from './generateDefaultSessions.ts'
import { mirrorAssemblySidecars } from './mirrorAssemblySidecars.ts'
import { readJSON, requireArg, writeJSON } from './util.ts'

import type { JBrowseConfig, UcscGenomeList } from './types.ts'
import type { FinalizeContext, FinalizeStep } from './utils/finalizeStep.ts'

//
// The tail of the pipeline: passes that each used to readdir UCSC_BUILT_DIR,
// re-read every config.json, mutate it and write it back. They are one walk
// now, which matters less for the ~0.6s it saves on the worst config than for
// what the array below says out loud. The order used to be a run of adjacent
// lines in make.sh, where nothing distinguished the adjacencies that are
// load-bearing from the ones that are historical accident:
//
// - generateDefaultSessions MUST precede createMinimalConfig. The minimal
//   config keeps whatever gene track the defaultSession opens, on top of
//   MINIMAL_TRACK_PATTERNS, and derives that exception from the session rather
//   than restating the priority list. Run the other way round, the 134
//   assemblies predating ncbiRefSeq ship a minimal config whose session opens a
//   track it just dropped, and the mate panel boots to an empty view.
// - ensureAssemblyAliasesAndCytobands MUST precede mirrorAssemblySidecars,
//   which mirrors the refNameAliases and cytobands urls the first one adds.
//   Backwards, a freshly backfilled alias file stays pointed at hgdownload
//   until the next build.
// - dropGlobTracks goes FIRST, and that is load-bearing in the weak sense: it
//   removes tracks that name a file we do not publish, and every later step
//   reads tracks[] -- generateDefaultSessions picks one, createMinimalConfig
//   copies a subset. Running it last would leave the garbage in minimal.json.
// - the other adjacencies are accident. They are kept in their historical order
//   anyway, so fusing the passes could be proven byte-identical against a real
//   built tree.
//
const STEPS: FinalizeStep[] = [
  dropGlobTracks,
  ensureAssemblyAliasesAndCytobands,
  mirrorAssemblySidecars,
  ensureUcscAssemblyNames,
  ensureTextSearchAdapters,
  generateDefaultSessions,
  createMinimalConfig,
]

if (process.argv.length !== 4) {
  console.error(
    'Usage: node finalizeConfigs.ts <UCSC_BUILT_DIR> <UCSC_DOWNLOADS_DIR>',
  )
  process.exit(1)
}

const builtDir = requireArg(process.argv[2], 'UCSC_BUILT_DIR is required')
const downloadsDir = requireArg(
  process.argv[3],
  'UCSC_DOWNLOADS_DIR is required',
)

const { ucscGenomes } = readJSON<UcscGenomeList>(
  path.join(builtDir, 'list.json'),
)

// Restricted to names the current UCSC genome list actually recognizes (plus
// hgFixed, rsynced separately and never in that list) so a stray leftover
// build directory doesn't get finalized. ucsc2jbrowse/configs/renames.json was
// exactly this: a `renames` directory under UCSC_BUILT_DIR that was once
// mistakenly processed as an assembly and kept reappearing because nothing
// checked it was a real one. make.sh's copy step filters the same way.
const assemblyNames = fs
  .readdirSync(builtDir, { withFileTypes: true })
  .filter(entry => entry.isDirectory() && entry.name !== 'trix')
  .map(entry => entry.name)
  .filter(name => name === 'hgFixed' || Object.hasOwn(ucscGenomes, name))
  .filter(name => fs.existsSync(path.join(builtDir, name, 'config.json')))

const totals = new Map<string, Map<string, number>>()
const failures: string[] = []

// Low concurrency on purpose: the only network left in this walk is the
// chromAlias fetch in mirrorAssemblySidecars, and hgdownload drops connections
// under bursts.
await mapWithConcurrency(assemblyNames, 4, async assemblyName => {
  const configPath = path.join(builtDir, assemblyName, 'config.json')
  try {
    const ctx: FinalizeContext = {
      assemblyName,
      dir: path.join(builtDir, assemblyName),
      dbDir: path.join(downloadsDir, assemblyName, assemblyName, 'database'),
      genome: ucscGenomes[assemblyName],
      config: readJSON<JBrowseConfig>(configPath),
    }

    for (const step of STEPS) {
      const counts = await step.run(ctx)
      let perStep = totals.get(step.name)
      if (!perStep) {
        perStep = new Map()
        totals.set(step.name, perStep)
      }
      for (const [label, n] of Object.entries(counts)) {
        perStep.set(label, (perStep.get(label) ?? 0) + n)
      }
    }

    writeJSON(configPath, ctx.config)
  } catch (e) {
    failures.push(assemblyName)
    console.error(`Error finalizing ${assemblyName}:`, e)
  }
})

console.warn(
  `\nFinalized ${assemblyNames.length - failures.length} of ${assemblyNames.length} configs`,
)
for (const step of STEPS) {
  const perStep = [...(totals.get(step.name) ?? new Map<string, number>())]
  console.warn(
    `  ${step.name}: ${
      perStep.length > 0
        ? perStep.map(([label, n]) => `${n} ${label}`).join(', ')
        : 'nothing to do'
    }`,
  )
}

if (failures.length > 0) {
  console.error(`\nFailed to finalize: ${failures.join(', ')}`)
  process.exit(1)
}
