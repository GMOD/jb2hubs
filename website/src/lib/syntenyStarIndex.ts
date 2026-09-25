import {
  MIN_MATES,
  liftOverMateOf,
} from '../../../ucsc2jbrowse/src/multiwayStarTrack.ts'

import type { SyntenyCatalogData } from './syntenyCatalog.ts'
import type { StarIndex } from './syntenyStars.ts'

// A UCSC db ahead of any accession-named assembly and ordered by its build
// number (panTro6 over panTro3); an accession by its number and version, which
// is how NCBI orders submissions. The catalog records no accession for most
// current UCSC builds, so a db's build number is the only age it has
function recency(name: string): number[] {
  const accession = /^GC[AF]_(\d+)\.(\d+)/.exec(name)
  return accession
    ? [1, Number(accession[1]), Number(accession[2])]
    : [2, Number(/(\d+)$/.exec(name)?.[1] ?? 0), 0]
}

function newer(a: string, b: string) {
  const x = recency(a)
  const y = recency(b)
  for (let k = 0; k < x.length; k++) {
    if (x[k] !== y[k]) {
      return (x[k] ?? 0) > (y[k] ?? 0)
    }
  }
  return false
}

/**
 * The builder's own mate rule over the same liftOver tracks, so a reference
 * here is a star in its config-staging.json
 */
export function starIndex(
  data: SyntenyCatalogData,
  references: Iterable<string>,
) {
  const stars: StarIndex = {}
  for (const anchor of references) {
    const mates = data.tracks.flatMap(track => {
      const mate = liftOverMateOf(track, anchor)
      return mate === undefined ? [] : [mate]
    })
    if (mates.length >= MIN_MATES) {
      const taxa: Record<string, string> = {}
      for (const mate of mates) {
        const taxonId = data.assemblyInfo[mate]?.taxonId
        const held = taxonId === undefined ? undefined : taxa[taxonId]
        if (
          taxonId !== undefined &&
          (held === undefined || newer(mate, held))
        ) {
          taxa[taxonId] = mate
        }
      }
      stars[anchor] = { mates, taxa }
    }
  }
  return stars
}
