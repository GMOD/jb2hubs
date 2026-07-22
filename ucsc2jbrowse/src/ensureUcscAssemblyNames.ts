import fs from 'fs'
import path from 'path'

import { readJSON, requireArg, writeJSON } from './util.ts'

//
// GenArk-backed UCSC aliases (rn8, Fca126_mat1.0, GRCg7b, ...) are served at
// /ucsc/<db>/config.json but their hub.txt declares `genome <accession>`, so
// generateJBrowseConfigForAssemblyHub names the assembly after the accession
// and the UCSC db name appears nowhere in the config. Two consequences:
//
// - anything referencing the assembly by db name fails to resolve, which makes
//   the hubs plugin treat it as an unrecognized assembly and load this very
//   config back as a connection, duplicating every track
// - the displayName comes from the hub's shortLabel, which for some assemblies
//   (e.g. GRCg7b) never mentions the UCSC name the user clicked on
//
// Adding the db name as an alias fixes resolution without renaming the
// assembly, so the accession-based trackIds and assemblyNames stay canonical.
// The displayName is rewritten to match the `<organism> (<db>)` form that
// createAssembly.ts uses for native golden-path assemblies.
//

if (process.argv.length !== 3) {
  console.error('Usage: node ensureUcscAssemblyNames.ts <UCSC_BUILT_DIR>')
  process.exit(1)
}

const builtDir = requireArg(process.argv[2], 'UCSC_BUILT_DIR is required')

interface Assembly {
  name: string
  displayName?: string
  aliases?: string[]
}

interface UcscGenome {
  organism?: string
}

const { ucscGenomes } = readJSON<{
  ucscGenomes: Record<string, UcscGenome>
}>(path.join(builtDir, 'list.json'))

let updated = 0

for (const [dbName, genome] of Object.entries(ucscGenomes)) {
  const configPath = path.join(builtDir, dbName, 'config.json')
  if (fs.existsSync(configPath)) {
    const config = readJSON<{ assemblies?: Assembly[] }>(configPath)
    const assembly = config.assemblies?.[0]

    if (assembly && assembly.name !== dbName) {
      let changed = false
      if (!assembly.aliases?.includes(dbName)) {
        assembly.aliases = [...(assembly.aliases ?? []), dbName]
        changed = true
      }
      const { organism } = genome
      if (organism) {
        const displayName = `${organism} (${dbName})`
        if (assembly.displayName !== displayName) {
          assembly.displayName = displayName
          changed = true
        }
      }
      if (changed) {
        writeJSON(configPath, config)
        updated++
        console.warn(`Aliased ${assembly.name} as ${dbName}`)
      }
    }
  }
}

console.warn(`\nEnsured UCSC assembly names on ${updated} configs`)
