import fs from 'fs'
import { gunzipSync } from 'node:zlib'
import path from 'path'

import { mapWithConcurrency, mirrorAssemblySidecars } from 'hubtools'

import { readJSON, requireArg, writeJSON } from './util.ts'

import type { AssemblySidecarTarget } from 'hubtools'

//
// Copies each assembly's chrom.sizes / chromAlias / cytoBand next to its
// config.json and points the config at the local copies, so an hgdownload
// outage costs the sequence track rather than the whole session. See
// hubtools/src/mirrorSidecars.ts for why all three matter.
//
// Golden-path assemblies serve two of the three from the rsync'd database/ dir
// rather than the network:
//
//   chrom.sizes  == chromInfo.txt.gz columns 1-2 (the third is fileName)
//   cytoBand     == the very file the config already names under database/
//
// Only bigZips/<db>.chromAlias.txt has no local equivalent -- the database
// chromAlias table is (alias, chrom, source) triples, a different shape from
// the header-and-matrix file RefNameAliasAdapter reads -- so that one is
// fetched. Hub assemblies (hs1, GenArk-backed aliases) have no database/ dir
// and fetch all three.
//
// Runs over every assembly every build, like ensureAssemblyAliasesAndCytobands:
// config.json is regenerated with upstream urls whenever an assembly changes,
// so the rewrite has to be reapplied, and an assembly whose fetch failed last
// time gets another chance. Already-mirrored files are reused, so a steady-state
// run does no network I/O at all.
//

if (process.argv.length !== 4) {
  console.error(
    'Usage: node mirrorAssemblySidecars.ts <UCSC_BUILT_DIR> <UCSC_DOWNLOADS_DIR>',
  )
  process.exit(1)
}

const builtDir = requireArg(process.argv[2], 'UCSC_BUILT_DIR is required')
const downloadsDir = requireArg(
  process.argv[3],
  'UCSC_DOWNLOADS_DIR is required',
)

// REPROCESS re-derives outputs from cached downloads; FETCH_UPDATES re-pulls
// upstream files even when a local copy exists. Only the latter should make us
// re-download a sidecar we already have.
const force = !!process.env.FETCH_UPDATES

interface Config {
  assemblies?: AssemblySidecarTarget[]
}

/**
 * Serves a sidecar out of the assembly's rsync'd database/ dir when the local
 * table holds the same data, so the common case needs no network.
 */
function localProvider(dbDir: string) {
  return ({ url }: { url: string }) => {
    const base = path.posix.basename(new URL(url).pathname)
    if (base.endsWith('.chrom.sizes')) {
      const chromInfo = path.join(dbDir, 'chromInfo.txt.gz')
      if (fs.existsSync(chromInfo)) {
        const text = new TextDecoder().decode(
          gunzipSync(fs.readFileSync(chromInfo)),
        )
        const lines = text
          .split('\n')
          .filter(line => !!line.trim())
          .map(line => line.split('\t').slice(0, 2).join('\t'))
        return lines.length > 0
          ? Buffer.from(`${lines.join('\n')}\n`)
          : undefined
      }
    } else if (base.startsWith('cytoBand')) {
      // the config names database/<file> directly, so this is a plain copy
      const src = path.join(dbDir, base)
      if (fs.existsSync(src)) {
        return fs.readFileSync(src)
      }
    }
    return undefined
  }
}

const assemblyDirs = fs
  .readdirSync(builtDir, { withFileTypes: true })
  .filter(entry => entry.isDirectory() && entry.name !== 'trix')
  .map(entry => entry.name)
  .filter(name => fs.existsSync(path.join(builtDir, name, 'config.json')))

let mirrored = 0
let failed = 0

// Low concurrency on purpose: the only fetches left are the chromAlias files,
// and hgdownload drops connections under bursts.
await mapWithConcurrency(assemblyDirs, 4, async assemblyName => {
  const dir = path.join(builtDir, assemblyName)
  const configPath = path.join(dir, 'config.json')
  const config = readJSON<Config>(configPath)
  const assembly = config.assemblies?.[0]
  if (!assembly) {
    return
  }
  const dbDir = path.join(downloadsDir, assemblyName, assemblyName, 'database')
  const result = await mirrorAssemblySidecars({
    assembly,
    dir,
    force,
    provideLocal: fs.existsSync(dbDir) ? localProvider(dbDir) : undefined,
  })
  if (result.mirrored.length > 0) {
    mirrored++
    console.warn(`Mirrored ${assemblyName}: ${result.mirrored.join(', ')}`)
  }
  if (result.failed.length > 0) {
    failed++
  }
  if (result.changed) {
    writeJSON(configPath, config)
  }
})

console.warn(
  `\nMirrored sidecars for ${mirrored} assemblies (${failed} with at least one sidecar left pointing upstream)`,
)

export {}
