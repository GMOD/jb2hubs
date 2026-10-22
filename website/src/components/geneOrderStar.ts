import { hostedUrl, ucscConfigPath } from '../config/jbrowse.ts'
import { specUrl } from './jbrowseLinks.ts'
import { rowOrder } from './rowOrder.ts'

import type { StarIndex } from '../lib/syntenyStars.ts'
import type { DrilldownData, HostedGenome } from './multiSyntenyDrilldown.ts'
import type { RowLayout } from './multiSyntenyLayout.ts'
import type { Neighborhood, PlacedGene, SpeciesRow } from './neighborhood.ts'

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

// Panel genomes whose chain misses genes NCBI places, by the taxon NCBI files
// them under: hg38's chain put chicken's TP53 lane on chr9, 17.25 Mb
// (2026-10-15). Where NCBI places the searched gene in one of these, its lane
// is drawn from NCBI's ortholog pairs instead.
const NCBI_FIRST: Record<string, number> = { galGal6: 9031, danRer11: 7955 }

export const ALIGNED_TRACK_NAME = 'Placed by whole-genome alignment'
export const ORTHOLOG_TRACK_NAME = 'Placed by NCBI orthologs'

// MultiWaySyntenyDisplay's lane pitch with a gene-name row and no layers
const LANE_PITCH = 36

// A MultiWaySyntenyDisplay drawing `lanes` in that order, tall enough that it
// never scrolls; `sort` pins the order, since the display otherwise sorts
// lanes densest-first
export function multiWayDisplay(
  trackId: string,
  lanes: string[],
  lanePitch: number,
) {
  return {
    trackId,
    type: 'MultiWaySyntenyDisplay',
    ...(lanes.length > 0
      ? {
          rows: { kept: lanes, ...rowOrder(lanes) },
          height: (lanes.length + 1) * lanePitch,
        }
      : {}),
  }
}

// ucsc2jbrowse names a UCSC mate's chain after its capitalized db, and a GenArk
// mate's after its accession
function chainPath(ref: string, mate: string) {
  const name = /^GC[AF]_/.test(mate)
    ? mate
    : `${mate.charAt(0).toUpperCase()}${mate.slice(1)}`
  return `/ucsc/${ref}/liftOver/${ref}To${name}.over.pif.gz`
}

interface OrthologLane {
  name: string
  paf: string
}

// One PAF record per ortholog pair NCBI places on the searched gene's own
// sequence: zebrafish's tp53 sits on another chromosome from its neighbors,
// which would stretch the lane over both. NCBI ranges are 1-based, PAF's
// 0-based half-open.
export function orthologPaf(
  genes: PlacedGene[],
  refGenes: PlacedGene[],
  queryId: string,
) {
  const refByAnchor = new Map(refGenes.map(g => [g.anchorId, g]))
  const query = genes.find(g => g.anchorId === queryId)
  const pairs = genes.flatMap(g => {
    const r = refByAnchor.get(g.anchorId)
    return r && g.refName === query?.refName ? [{ g, r }] : []
  })
  const qLen = Math.max(0, ...pairs.map(p => p.g.end))
  const tLen = Math.max(0, ...pairs.map(p => p.r.end))
  return pairs
    .map(({ g, r }) =>
      [
        g.refName,
        qLen,
        g.start - 1,
        g.end,
        g.strand === r.strand ? '+' : '-',
        r.refName,
        tLen,
        r.start - 1,
        r.end,
        Math.min(g.end - g.start, r.end - r.start) + 1,
        Math.max(g.end - g.start, r.end - r.start) + 1,
        60,
      ].join('\t'),
    )
    .join('\n')
}

function orthologLane(
  species: SpeciesRow[],
  taxonId: number,
  refGenes: PlacedGene[],
  queryId: string,
  hosted: (accession: string) => HostedGenome,
): OrthologLane | undefined {
  const genes = species.find(s => s.taxonId === taxonId)?.genes ?? []
  const query = genes.find(g => g.anchorId === queryId)
  const genome = query ? hosted(query.assembly) : undefined
  return query && genome
    ? {
        name: genome.ucscDb ?? genome.accession,
        paf: orthologPaf(genes, refGenes, queryId),
      }
    : undefined
}

export interface StarInput {
  ref: string | undefined
  loc: string | undefined
  stars: StarIndex
  // Without it the reference lane draws its config's first annotation track,
  // which on hg38 labels HBB "CCDS7753.1-gene"
  geneTrack?: string
  // The page's whole neighborhood, untrimmed, for the NCBI_FIRST lanes
  species?: SpeciesRow[]
  refGenes?: PlacedGene[]
  queryId?: string
  hosted?: (accession: string) => HostedGenome
}

function starTrack(
  trackId: string,
  name: string,
  ref: string,
  lanes: string[],
  adapters: object[],
  geneTrack: string | undefined,
) {
  return {
    type: 'SyntenyTrack',
    trackId,
    name,
    assemblyNames: [ref, ...lanes],
    adapter: {
      type: 'MultiPairwiseSyntenyAdapter',
      adapters,
      lanes: lanes.map(lane => ({ name: lane })),
    },
    ...(geneTrack
      ? {
          displays: [
            {
              type: 'MultiWaySyntenyDisplay',
              displayId: `${trackId}-MultiWaySyntenyDisplay`,
              laneGeneTracks: [geneTrack],
            },
          ],
        }
      : {}),
  }
}

// One genome view on the reference, with the star as session tracks, so the
// display stays out of every config.json an old JBrowse reads. A track's name
// says what placed its lanes: the chain, or NCBI's ortholog pairs.
export function geneOrderStarUrl({
  ref,
  loc,
  stars,
  geneTrack,
  species = [],
  refGenes = [],
  queryId,
  hosted,
}: StarInput) {
  const mates = ref ? stars[ref]?.mates : undefined
  const panel = (ref ? (STAR_PANELS[ref] ?? []) : []).filter(m =>
    mates?.includes(m),
  )
  if (!ref || !loc || panel.length === 0) {
    return undefined
  }
  const orthologs = new Map<string, OrthologLane>()
  for (const mate of panel) {
    const taxonId = NCBI_FIRST[mate]
    const lane =
      taxonId !== undefined && queryId && hosted
        ? orthologLane(species, taxonId, refGenes, queryId, hosted)
        : undefined
    if (lane?.paf) {
      orthologs.set(mate, lane)
    }
  }
  const aligned = panel.filter(m => !orthologs.has(m))
  const ncbi = [...orthologs.values()]
  const tracks = [
    aligned.length > 0 && {
      lanes: aligned,
      track: starTrack(
        `${ref}_gene_order_aligned`,
        ALIGNED_TRACK_NAME,
        ref,
        aligned,
        aligned.map(mate => ({
          type: 'PairwiseIndexedPAFAdapter',
          targetAssembly: ref,
          queryAssembly: mate,
          pifGzLocation: { uri: hostedUrl(chainPath(ref, mate)) },
          index: {
            location: { uri: hostedUrl(`${chainPath(ref, mate)}.csi`) },
            indexType: 'CSI',
          },
        })),
        geneTrack,
      ),
    },
    ncbi.length > 0 && {
      lanes: ncbi.map(l => l.name),
      track: starTrack(
        `${ref}_gene_order_orthologs`,
        ORTHOLOG_TRACK_NAME,
        ref,
        ncbi.map(l => l.name),
        ncbi.map(l => ({
          type: 'PAFAdapter',
          targetAssembly: ref,
          queryAssembly: l.name,
          pafLocation: {
            uri: `data:text/plain;base64,${btoa(`${l.paf}\n`)}`,
          },
        })),
        geneTrack,
      ),
    },
  ].filter(t => t !== false)
  const url = specUrl(
    ucscConfigPath(ref),
    [
      {
        type: 'LinearGenomeView',
        assembly: ref,
        loc,
        tracks: tracks.map(({ lanes, track }) =>
          multiWayDisplay(track.trackId, lanes, LANE_PITCH),
        ),
      },
    ],
    tracks.map(t => t.track),
  )
  return { url, genomes: panel.length }
}

// The star for the page's figure: the reference row's whole neighborhood plus
// 5% each side, so it opens on the region the ribbons describe with the edge
// genes off the border. Locstrings are 1-based, so the flanked start clamps
// to 1.
export function neighborhoodStar(
  nb: Neighborhood,
  rows: RowLayout[],
  allSpecies: SpeciesRow[],
  { hosted, stars }: Pick<DrilldownData, 'hosted' | 'stars'>,
) {
  const queryId = nb.query.geneId
  const refRow = rows.find(row => row.isRef && row.hasQuery)
  const refGenes =
    nb.species.find(s => s.taxonId === nb.query.refTaxonId)?.genes ?? []
  const refAssembly = refGenes.find(g => g.anchorId === queryId)?.assembly
  if (!refRow || !refAssembly) {
    return undefined
  }
  const flank = Math.round((refRow.spanEnd - refRow.spanStart) * 0.05)
  const genome = hosted(refAssembly)
  return geneOrderStarUrl({
    ref: genome?.ucscDb,
    loc: `${refRow.refName}:${Math.max(1, refRow.spanStart - flank)}-${refRow.spanEnd + flank}`,
    stars,
    geneTrack: genome?.geneTrack,
    species: allSpecies,
    refGenes,
    queryId,
    hosted,
  })
}
