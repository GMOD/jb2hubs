import fs from 'fs'
import path from 'path'

import { readJSON, requireArg, writeJSON } from './util.ts'
import {
  getCytobands,
  getRefNameAliases,
} from './utils/assemblyAliasesAndCytobands.ts'

//
// Backfills refNameAliases/cytobands on golden-path configs that are missing
// them. createAssembly.ts already emits both, but it only runs for assemblies
// whose trackDb changed, so a config built before this data existed (or built
// while the old live probe was being throttled by hgdownload) would keep the
// gap forever. Running this every build makes the invariant "every assembly
// with a local chromAlias table has refNameAliases" hold continuously instead
// of only at config-creation time.
//
// Hub assemblies get their aliases from the hub's own chromAlias bigBed and
// have no rsync'd database/ dir, so they are skipped and never overwritten.
//

if (process.argv.length !== 4) {
  console.error(
    'Usage: node ensureAssemblyAliasesAndCytobands.ts <UCSC_BUILT_DIR> <UCSC_DOWNLOADS_DIR>',
  )
  process.exit(1)
}

const builtDir = requireArg(process.argv[2], 'UCSC_BUILT_DIR is required')
const downloadsDir = requireArg(
  process.argv[3],
  'UCSC_DOWNLOADS_DIR is required',
)

interface Assembly {
  name: string
  refNameAliases?: unknown
  cytobands?: unknown
}

let aliasesAdded = 0
let cytobandsAdded = 0

for (const entry of fs.readdirSync(builtDir, { withFileTypes: true })) {
  if (entry.isDirectory() && entry.name !== 'trix') {
    const assemblyName = entry.name
    const configPath = path.join(builtDir, assemblyName, 'config.json')
    const dbDir = path.join(
      downloadsDir,
      assemblyName,
      assemblyName,
      'database',
    )

    if (fs.existsSync(configPath) && fs.existsSync(dbDir)) {
      const config = readJSON<{ assemblies?: Assembly[] }>(configPath)
      const assembly = config.assemblies?.[0]
      let changed = false

      if (assembly) {
        if (!assembly.refNameAliases) {
          const refNameAliases = getRefNameAliases(assemblyName, dbDir)
          if (refNameAliases) {
            assembly.refNameAliases = refNameAliases
            aliasesAdded++
            changed = true
            console.warn(`Added refNameAliases: ${assemblyName}`)
          }
        }
        if (!assembly.cytobands) {
          const cytobands = getCytobands(assemblyName, dbDir)
          if (cytobands) {
            assembly.cytobands = cytobands
            cytobandsAdded++
            changed = true
            console.warn(`Added cytobands: ${assemblyName}`)
          }
        }
        if (changed) {
          writeJSON(configPath, config)
        }
      }
    }
  }
}

console.warn(
  `\nEnsured assembly aliases: ${aliasesAdded} refNameAliases, ${cytobandsAdded} cytobands added`,
)
