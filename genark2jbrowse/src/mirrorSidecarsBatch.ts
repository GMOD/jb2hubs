import fs from 'fs'
import path from 'path'
import * as readline from 'readline'

import {
  mapWithConcurrency,
  mirrorAssemblySidecars,
  readJSON,
  writeJSON,
} from 'hubtools'

import type { AssemblySidecarTarget } from 'hubtools'

//
// Mirrors each GenArk assembly's chrom.sizes and chromAlias into the hub
// directory next to config.json, and points the config at them, so a UCSC
// outage no longer takes the whole assembly down with it (see
// hubtools/src/mirrorSidecars.ts). GenArk hubs have no cytoband file and no
// rsync'd database/ dir, so both files are fetched from hgdownload -- once:
// a mirrored file is reused on every later run.
//
// Reads config.json paths on stdin, like enhanceConfigsBatch.ts. It is run over
// every hub, not just the changed ones, because the ~50k hubs built before this
// existed need backfilling and a config regenerated later comes back with
// upstream urls. The stamp file keeps the steady-state sweep to two stats per
// hub: mirroring is redone only when config.json is newer than the last mirror.
//

const STAMP = '.sidecars-mirrored'
const force = !!process.env.FETCH_UPDATES

interface Config {
  assemblies?: AssemblySidecarTarget[]
}

const rl = readline.createInterface({ input: process.stdin })
const configPaths: string[] = []
for await (const line of rl) {
  const configPath = line.trim()
  if (configPath) {
    configPaths.push(configPath)
  }
}

let fetched = 0
let rewritten = 0
let failed = 0
let skipped = 0

// hgdownload drops connections under bursts (see the note in
// ucsc2jbrowse/src/utils/assemblyAliasesAndCytobands.ts), and this sweep is
// tens of thousands of small files, so keep it gentle.
await mapWithConcurrency(configPaths, 8, async configPath => {
  const dir = path.dirname(configPath)
  const stampPath = path.join(dir, STAMP)
  try {
    if (!force && fs.existsSync(stampPath)) {
      const stamp = fs.statSync(stampPath).mtimeMs
      if (stamp >= fs.statSync(configPath).mtimeMs) {
        skipped++
        return
      }
    }
    const config = readJSON<Config>(configPath)
    const assembly = config.assemblies?.[0]
    if (!assembly) {
      return
    }
    const result = await mirrorAssemblySidecars({ assembly, dir, force })
    if (result.changed) {
      writeJSON(configPath, config)
      rewritten++
    }
    if (result.failed.length > 0) {
      failed++
    } else {
      // only stamp a fully mirrored assembly, so a failed sidecar is retried
      fs.writeFileSync(stampPath, '')
    }
    if (result.mirrored.length > 0) {
      fetched++
    }
  } catch (e) {
    failed++
    console.error(`Error mirroring sidecars for ${configPath}: ${e}`)
  }
})

console.error(
  `Mirrored sidecars: ${fetched} fetched, ${rewritten} configs rewritten, ` +
    `${skipped} already stamped, ${failed} with a sidecar left pointing upstream`,
)

export {}
