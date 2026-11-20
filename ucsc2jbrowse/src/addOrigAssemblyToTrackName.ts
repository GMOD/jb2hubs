import { isString } from 'hubtools'

import type { FinalizeStep } from './utils/finalizeStep.ts'

/**
 * Suffixes a track's name with the assembly its trackDb says it came from,
 * when that is another assembly: hg19's own mappability tracks say
 * `origAssembly hg19`, and "(hg19)" on an hg19 track tells a reader nothing.
 */
export const addOrigAssemblyToTrackName: FinalizeStep = {
  name: 'original assembly in track names',
  run: ({ config, assemblyName }) => {
    const counts: Record<string, number> = {}
    for (const track of config.tracks) {
      const orig = track.metadata?.ucsc?.origAssembly
      if (isString(orig) && orig && orig !== assemblyName) {
        const suffix = `(${orig})`
        if (!track.name.endsWith(suffix)) {
          track.name = `${track.name} ${suffix}`
          counts.suffixed = (counts.suffixed ?? 0) + 1
        }
      }
    }
    return counts
  },
}
