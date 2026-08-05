import fs from 'fs'

import {
  getCytobands,
  getRefNameAliases,
} from './utils/assemblyAliasesAndCytobands.ts'

import type { FinalizeStep } from './utils/finalizeStep.ts'

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

export const ensureAssemblyAliasesAndCytobands: FinalizeStep = {
  name: 'assembly aliases and cytobands',
  run: ({ assemblyName, dbDir, config }) => {
    const counts: Record<string, number> = {}
    const assembly = config.assemblies[0]

    if (assembly && fs.existsSync(dbDir)) {
      if (!assembly.refNameAliases) {
        const refNameAliases = getRefNameAliases(assemblyName, dbDir)
        if (refNameAliases) {
          assembly.refNameAliases = refNameAliases
          counts.refNameAliases = 1
        }
      }
      if (!assembly.cytobands) {
        const cytobands = getCytobands(assemblyName, dbDir)
        if (cytobands) {
          assembly.cytobands = cytobands
          counts.cytobands = 1
        }
      }
    }

    return counts
  },
}
