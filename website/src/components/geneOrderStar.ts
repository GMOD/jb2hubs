import { lanePitch } from 'hubtools/lanePitch'

import {
  genomeAssemblyName,
  hostedUrl,
  ucscConfigPath,
} from '../config/jbrowse.ts'
import { specUrl } from './jbrowseLinks.ts'
import { kinshipRings, spreadOverRings } from './neighborhoodTrim.ts'
import { COMMON_TAX_RANK } from './referenceSpecies.ts'

import type { StarIndex, StarLanes } from '../lib/syntenyStars.ts'
import type { DrilldownData, HostedGenome } from './multiSyntenyDrilldown.ts'
import type { RowLayout } from './multiSyntenyLayout.ts'
import type { TaxonNode } from './multiSyntenyTaxonTree.ts'
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

// A reference with no panel of its own opens one lane per species of its
// star, never another build of its own species, chosen as the figure chooses
// its rows: a fair share from each ring of kinship around the reference,
// nearest first, so mouse opens on rat and still reaches human and chicken.
// The page's tree holds only species NCBI lists an ortholog in, and the chain
// places the rest all the same: they are a last ring, model organisms first,
// which is where mouse Hbb-bt finds rat. Capped at hg38's panel size: the
// 26-lane hg38 star took 14 s to settle (SYNTENY_LAUNCH_MEASUREMENTS.md).
const SPECIES_PANEL_SIZE = 12

const modelRank = (taxonId: number) =>
  COMMON_TAX_RANK.get(taxonId) ?? COMMON_TAX_RANK.size

function speciesPanel(
  lanes: StarLanes,
  tree: TaxonNode | undefined,
  refTaxonId: number | undefined,
) {
  const held = Object.keys(lanes.taxa)
    .map(Number)
    .filter(taxonId => taxonId !== refTaxonId)
  const kinship = refTaxonId === undefined ? [] : kinshipRings(tree, refTaxonId)
  const placed = kinship.flat()
  const rings = [
    ...kinship,
    held
      .filter(taxonId => !placed.includes(taxonId))
      .toSorted((a, b) => modelRank(a) - modelRank(b)),
  ].map(ring => ring.filter(taxonId => held.includes(taxonId)))
  return spreadOverRings(rings, SPECIES_PANEL_SIZE).flatMap(taxonId => {
    const lane = lanes.taxa[taxonId]
    return lane === undefined ? [] : [lane]
  })
}

function starPanel(
  ref: string,
  lanes: StarLanes | undefined,
  tree: TaxonNode | undefined,
  refTaxonId: number | undefined,
) {
  const named = STAR_PANELS[ref]
  return lanes
    ? named
      ? named.filter(m => lanes.mates.includes(m))
      : speciesPanel(lanes, tree, refTaxonId)
    : []
}

// Panel genomes whose chain misses genes NCBI places, by the taxon NCBI files
// them under: hg38's chain put chicken's TP53 lane on chr9, 17.25 Mb
// (2026-10-15). Where NCBI places the searched gene in one of these, its lane
// is drawn from NCBI's ortholog pairs instead.
const NCBI_FIRST: Record<string, number> = { galGal6: 9031, danRer11: 7955 }

export const ALIGNED_TRACK_NAME = 'Placed by whole-genome alignment'
export const ORTHOLOG_TRACK_NAME = 'Placed by NCBI orthologs'
export const MIXED_TRACK_NAME =
  'Placed by whole-genome alignment or NCBI orthologs'

// lanes that name their genes, with no layers under them
const LANE_PITCH = lanePitch(true)

// A MultiWaySyntenyDisplay drawing `lanes` in that order, tall enough that it
// never scrolls; `sort` pins the order, since the display otherwise sorts
// lanes densest-first
export function multiWayDisplay(
  trackId: string,
  lanes: string[],
  pitch: number,
) {
  return {
    trackId,
    type: 'MultiWaySyntenyDisplay',
    ...(lanes.length > 0
      ? {
          rows: { kept: lanes, sort: lanes },
          height: (lanes.length + 1) * pitch,
        }
      : {}),
  }
}

// A lane's chain as the reference's config names it, resolved against that
// config
function chainUrl(ref: string, chain: string) {
  return new URL(chain, hostedUrl(ucscConfigPath(ref))).href
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
        name: genomeAssemblyName(genome),
        paf: orthologPaf(genes, refGenes, queryId),
      }
    : undefined
}

interface StarInput {
  ref: string | undefined
  loc: string | undefined
  stars: StarIndex
  // Without it the reference lane draws its config's first annotation track,
  // which on hg38 labels HBB "CCDS7753.1-gene"
  geneTrack?: string
  // The page's whole neighborhood, untrimmed, for the NCBI_FIRST lanes
  species?: SpeciesRow[]
  // The page's species tree and the reference's place in it, for a species
  // panel
  tree?: TaxonNode
  refTaxonId?: number
  refGenes?: PlacedGene[]
  queryId?: string
  hosted?: (accession: string) => HostedGenome
}

// The lanes one star track draws, and what placed them
interface StarGroup {
  trackId: string
  name: string
  lanes: { name: string; adapter: object }[]
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
// says what placed its lanes: the chain, or NCBI's ortholog pairs. A star's
// anchor is the one assembly all its children name, so a track of one lane has
// none and JBrowse refuses it (NoCommonAssemblyError): a lone lane shares one
// track with the others, and a panel of one lane is no launch.
export function geneOrderStarUrl({
  ref,
  loc,
  stars,
  geneTrack,
  species = [],
  tree,
  refTaxonId,
  refGenes = [],
  queryId,
  hosted,
}: StarInput) {
  const star = ref ? stars[ref] : undefined
  const panel = (ref ? starPanel(ref, star, tree, refTaxonId) : []).flatMap(
    mate => {
      const chain = star?.chains[mate]
      return chain === undefined ? [] : [{ mate, chain }]
    },
  )
  if (!ref || !loc || panel.length < 2) {
    return undefined
  }
  const orthologs = new Map<string, OrthologLane>()
  for (const { mate } of panel) {
    const taxonId = NCBI_FIRST[mate]
    const lane =
      taxonId !== undefined && queryId && hosted
        ? orthologLane(species, taxonId, refGenes, queryId, hosted)
        : undefined
    if (lane?.paf) {
      orthologs.set(mate, lane)
    }
  }
  const placed: StarGroup[] = [
    {
      trackId: `${ref}_gene_order_aligned`,
      name: ALIGNED_TRACK_NAME,
      lanes: panel
        .filter(({ mate }) => !orthologs.has(mate))
        .map(({ mate, chain }) => ({
          name: mate,
          adapter: {
            type: 'PairwiseIndexedPAFAdapter',
            targetAssembly: ref,
            queryAssembly: mate,
            pifGzLocation: { uri: chainUrl(ref, chain) },
            index: {
              location: { uri: `${chainUrl(ref, chain)}.csi` },
              indexType: 'CSI',
            },
          },
        })),
    },
    {
      trackId: `${ref}_gene_order_orthologs`,
      name: ORTHOLOG_TRACK_NAME,
      lanes: [...orthologs.values()].map(l => ({
        name: l.name,
        adapter: {
          type: 'PAFAdapter',
          targetAssembly: ref,
          queryAssembly: l.name,
          pafLocation: {
            uri: `data:text/plain;base64,${btoa(`${l.paf}\n`)}`,
          },
        },
      })),
    },
  ]
  const filled = placed.filter(group => group.lanes.length > 0)
  const groups = filled.some(group => group.lanes.length === 1)
    ? [
        {
          trackId: `${ref}_gene_order`,
          name: MIXED_TRACK_NAME,
          lanes: filled.flatMap(group => group.lanes),
        },
      ]
    : filled
  const tracks = groups.map(({ trackId, name, lanes }) => ({
    lanes: lanes.map(l => l.name),
    track: starTrack(
      trackId,
      name,
      ref,
      lanes.map(l => l.name),
      lanes.map(l => l.adapter),
      geneTrack,
    ),
  }))
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
    tree: nb.tree,
    refTaxonId: nb.query.refTaxonId,
    refGenes,
    queryId,
    hosted,
  })
}
