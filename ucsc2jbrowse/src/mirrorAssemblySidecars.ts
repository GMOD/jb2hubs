import fs from 'fs'
import { gunzipSync } from 'node:zlib'
import path from 'path'

import { mirrorAssemblySidecars as mirrorSidecars } from 'hubtools'

import type { FinalizeStep } from './utils/finalizeStep.ts'

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

// REPROCESS re-derives outputs from cached downloads; FETCH_UPDATES re-pulls
// upstream files even when a local copy exists. Only the latter should make us
// re-download a sidecar we already have.
const force = !!process.env.FETCH_UPDATES

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

export const mirrorAssemblySidecars: FinalizeStep = {
  name: 'assembly sidecars',
  run: async ({ assemblyName, dir, dbDir, config }) => {
    const counts: Record<string, number> = {}
    const assembly = config.assemblies[0]

    if (assembly) {
      const result = await mirrorSidecars({
        assembly,
        dir,
        force,
        provideLocal: fs.existsSync(dbDir) ? localProvider(dbDir) : undefined,
      })
      if (result.mirrored.length > 0) {
        counts.mirrored = 1
        console.warn(`Mirrored ${assemblyName}: ${result.mirrored.join(', ')}`)
      }
      if (result.failed.length > 0) {
        counts['left pointing upstream'] = 1
      }
      if (result.dropped.length > 0) {
        counts['dropped because upstream 404s'] = 1
      }
    }

    return counts
  },
}
