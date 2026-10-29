// Drill-downs from the multi-way view into JBrowse:
//  - a clicked gene -> pairwise LinearSyntenyView when a precomputed chain
//    (synteny_pairs.json) links it to the reference, else single-genome;
//  - the reference's multi-way liftOver star, laned by the page's species.

import { ucscV5ConfigPath } from '../config/jbrowse.ts'
import { loadJsonOnce } from '../lib/fetchJson.ts'
import { type StarIndex, starLane } from '../lib/syntenyStars.ts'
import { multiWayDisplay } from './geneOrderStar.ts'
import { specUrl } from './jbrowseLinks.ts'
import { type HostedAssembly, loadStore } from './orthologDb.ts'
import {
  accessionToJbrowseUrl,
  isSameGenome,
  pairwiseOrthologUrl,
} from './orthologSearchUtils.ts'
import {
  type PairEntry,
  type PairIndex,
  buildPairIndex,
  syntenyLink,
} from './syntenyPairIndex.ts'

import type { PlacedGene } from './neighborhood.ts'

// MultiWaySyntenyDisplay's MIN_LANE_PITCH plus the gene-name row and the
// configured star's GC band under each lane (hubtools' starLanePitch)
const LANE_PITCH = 50

type LaneRow = { taxonId: number; assembly?: string }

function starLanesFor(
  refAccession: string | undefined,
  rows: LaneRow[],
  { hosted, stars }: DrilldownData,
) {
  const ucscDb = refAccession ? hosted(refAccession)?.ucscDb : undefined
  const starLanes = ucscDb ? stars[ucscDb] : undefined
  if (!ucscDb || !starLanes) {
    return undefined
  }
  const lanes = [
    ...new Set(
      rows
        .map(row => starLane(starLanes, row, hosted))
        .filter((mate): mate is string => mate !== undefined),
    ),
  ]
  return { ucscDb, lanes }
}

// Whether any of `rows` is a lane of the reference's star
export function hasStarLane(
  refAccession: string | undefined,
  rows: LaneRow[],
  drilldown: DrilldownData,
) {
  return (starLanesFor(refAccession, rows, drilldown)?.lanes.length ?? 0) > 0
}

// The reference's multi-way synteny star over the window the page draws, one
// lane per species the page shows that the star holds, in the order of `rows`.
// Undefined where the reference has no star.
export function starUrl(
  refAccession: string | undefined,
  refLoc: string | undefined,
  rows: LaneRow[],
  drilldown: DrilldownData,
) {
  const star = starLanesFor(refAccession, rows, drilldown)
  if (!star || !refLoc) {
    return undefined
  }
  const { ucscDb, lanes } = star
  return specUrl(ucscV5ConfigPath(ucscDb), [
    {
      type: 'LinearGenomeView',
      assembly: ucscDb,
      loc: refLoc,
      tracks: [
        multiWayDisplay(`${ucscDb}_liftOver_multiway`, lanes, LANE_PITCH),
      ],
    },
  ])
}

// The pair catalog, fetched once and indexed for tolerant
// (version/suffix/order-insensitive) lookup. A failure rejects, and
// loadJsonOnce forgets it, so whoever asks next fetches again.
function loadPairs(): Promise<PairIndex> {
  return loadJsonOnce<Record<string, PairEntry>>('/synteny_pairs.json').then(
    buildPairIndex,
  )
}

// Everything a drill-down url needs besides the clicked gene, loaded once so
// the figure can render real links: a click that only follows an href is not a
// popup for the blocker to eat, and it does not wait on an 806 KB index first.
// Any file that will not load rejects, so the page's SWR retries it; meanwhile
// NO_DRILLDOWN links nothing and says `unavailable`, so a page cannot read its
// empty `hosted` as "not a genome we host".
export interface DrilldownData {
  index: PairIndex
  hosted: (accession: string) => HostedGenome
  stars: StarIndex
  unavailable?: boolean
}

export const NO_DRILLDOWN: DrilldownData = {
  index: new Map(),
  hosted: () => undefined,
  stars: {},
  unavailable: true,
}

export async function loadDrilldownData(): Promise<DrilldownData> {
  const [index, store, stars] = await Promise.all([
    loadPairs(),
    loadStore(),
    loadJsonOnce<StarIndex>('/synteny_stars.json'),
  ])
  return { index, hosted: accession => store.find(accession), stars }
}

// What the assembly index says about the genome a clicked gene sits on:
// `undefined` when we do not host it
export type HostedGenome = HostedAssembly | undefined

// The best JBrowse URL for a clicked gene, or undefined when there is nothing of
// ours to open. Pure, so the two branches and the guard between them stay
// unit-testable.
//
// The single-genome fallback goes through `hosted` rather than off the accession
// NCBI reported, for two reasons the accession alone cannot supply.
//
// A UCSC-native genome has to open its curated /ucsc/<db> config, which is what
// the rest of the site links to and the only one with a defaultSession worth
// opening. Built from the bare accession it opened the GenArk hub instead — for
// 61 of the 62 that is a working but far sparser config, and for **human** it is
// a browser with no sequence at all: alone among the 62, GCF_000001405.40's
// GenArk 2bit and chrom.sizes both 404 (swept 2026-08-27). Human is the default
// reference, and the reference's own gene is the most-clicked thing on the page.
//
// And NCBI may report against a version we do not host, where the index answers
// with the version we do.
//
// The pairwise branch needs both genes placed on exactly the genomes its panels
// open: syntenyLink matches across assembly versions, and a locstring from
// NCBI's version resolves on another only by luck.
export function geneDrilldownUrl(
  gene: PlacedGene,
  refAccession: string | undefined,
  refGene: PlacedGene | undefined,
  { index, hosted }: Pick<DrilldownData, 'index' | 'hosted'>,
  flipped = false,
) {
  const genome = hosted(gene.assembly)
  const candidate =
    refAccession && gene.assembly !== refAccession
      ? syntenyLink(index, gene.assembly, refAccession)
      : undefined
  const refGenome = refGene ? hosted(refGene.assembly) : undefined
  const placed = (name: string, g: HostedGenome) =>
    g?.exact === true && isSameGenome(name, g)
  if (
    candidate &&
    placed(candidate.names[0], genome) &&
    (!refGene || placed(candidate.names[1], refGenome))
  ) {
    return pairwiseOrthologUrl(candidate, gene, refGene, flipped)
  }
  return genome
    ? accessionToJbrowseUrl(
        genome.accession,
        gene,
        genome.ucscDb,
        genome.geneTrack,
      )
    : undefined
}
