import { hostedUrl, ucscConfigPath } from '../config/jbrowse.ts'
import { specUrl } from './jbrowseLinks.ts'

import type { StarIndex } from '../lib/syntenyStars.ts'

// The genomes a reference's gene opens against, nearest first, chosen apart
// from NCBI: human HBB has no NCBI ortholog in chimp, gorilla or mouse, and the
// liftOver chain still places all three on the globin cluster. Gorilla is the
// T2T build, since gorGor6 put HBB and TP53 on unplaced scaffolds (2026-10-15).
export const STAR_PANELS: Record<string, string[]> = {
  hg38: [
    'panTro6',
    'GCF_029281585.2',
    'ponAbe3',
    'rheMac10',
    'calJac4',
    'mm39',
    'rn7',
    'canFam6',
    'bosTau9',
    'monDom5',
    'galGal6',
    'danRer11',
  ],
}

export const STAR_TRACK_NAME = 'Placed by whole-genome alignment'

// MultiWaySyntenyDisplay's lane pitch with a gene-name row and no layers
const LANE_PITCH = 36

// ucsc2jbrowse names a UCSC mate's chain after its capitalized db, and a GenArk
// mate's after its accession
function chainPath(ref: string, mate: string) {
  const name = /^GC[AF]_/.test(mate)
    ? mate
    : `${mate.charAt(0).toUpperCase()}${mate.slice(1)}`
  return `/ucsc/${ref}/liftOver/${ref}To${name}.over.pif.gz`
}

// One genome view on the reference, with the star as a session track, so the
// display stays out of every config.json an old JBrowse reads. Each lane is
// placed by its chain alone.
export function geneOrderStarUrl(
  ref: string | undefined,
  loc: string | undefined,
  stars: StarIndex,
) {
  const mates = ref ? stars[ref]?.mates : undefined
  const lanes = (ref ? (STAR_PANELS[ref] ?? []) : []).filter(m =>
    mates?.includes(m),
  )
  if (!ref || !loc || lanes.length === 0) {
    return undefined
  }
  const trackId = `${ref}_gene_order_star`
  const track = {
    type: 'SyntenyTrack',
    trackId,
    name: STAR_TRACK_NAME,
    assemblyNames: [ref, ...lanes],
    adapter: {
      type: 'MultiPairwiseSyntenyAdapter',
      adapters: lanes.map(mate => ({
        type: 'PairwiseIndexedPAFAdapter',
        targetAssembly: ref,
        queryAssembly: mate,
        pifGzLocation: { uri: hostedUrl(chainPath(ref, mate)) },
        index: {
          location: { uri: hostedUrl(`${chainPath(ref, mate)}.csi`) },
          indexType: 'CSI',
        },
      })),
      lanes: lanes.map(name => ({ name })),
    },
  }
  const url = specUrl(
    ucscConfigPath(ref),
    [
      {
        type: 'LinearGenomeView',
        assembly: ref,
        loc,
        tracks: [
          {
            trackId,
            type: 'MultiWaySyntenyDisplay',
            rows: { kept: lanes, domain: lanes },
            height: (lanes.length + 1) * LANE_PITCH,
          },
        ],
      },
    ],
    [track],
  )
  return { url, genomes: lanes.length }
}
