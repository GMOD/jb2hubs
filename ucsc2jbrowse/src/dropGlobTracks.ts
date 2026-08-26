import type { FinalizeStep } from './utils/finalizeStep.ts'

//
// A track whose adapter names a literal `*.gff.gz` is the residue of a shell
// loop that ran with nullglob off over a directory with nothing to match: the
// pattern is passed through unexpanded, and the adder downstream mints a track
// from it. cb1 and hgFixed carried exactly that -- `cb1-*` and `hgFixed-*`,
// Gff3TabixAdapter on `*.gff.gz` plus `*.gff.gz.csi` -- from 2025-05-13 until
// 2026-08-26.
//
// The loop that produced them was fixed at the source long ago
// (createConfigsForGoldenPath.sh sets `shopt -s nullglob` around both globs),
// but a fix at the source only reaches a config that is regenerated. These two
// are the repo's only non-assemblies: `is_assembly_db` excludes them from every
// derivation pass, so their tracks[] is effectively frozen and no amount of
// rebuilding would have cleared it. Finalization is the one pass that does
// visit them, hence here.
//
// So this is both the cleanup and the standing guard. A glob character in a
// location cannot be a filename we publish -- our own bucket has no such key,
// and the track is a guaranteed 404 -- so dropping it costs nothing real and
// the next forgotten nullglob is swept up rather than shipped.
//

const LOCATION_KEYS = new Set(['uri', 'chromSizes'])
const GLOB_CHARS = /[*?]/

function namesAGlob(node: unknown): boolean {
  let found = false
  if (node && typeof node === 'object') {
    for (const [key, value] of Object.entries(node)) {
      if (typeof value === 'string') {
        if (LOCATION_KEYS.has(key) && GLOB_CHARS.test(value)) {
          found = true
        }
      } else {
        if (namesAGlob(value)) {
          found = true
        }
      }
    }
  }
  return found
}

export const dropGlobTracks: FinalizeStep = {
  name: 'glob tracks',
  run: ({ config }) => {
    const counts: Record<string, number> = {}
    const kept = config.tracks.filter(track => !namesAGlob(track.adapter))

    if (kept.length !== config.tracks.length) {
      counts.dropped = config.tracks.length - kept.length
      config.tracks = kept
    }

    return counts
  },
}
