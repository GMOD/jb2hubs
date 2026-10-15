// Drill-downs from the multi-way view into JBrowse:
//  - a clicked gene -> pairwise LinearSyntenyView when a precomputed chain
//    (synteny_pairs.json) links it to the reference, else single-genome;
//  - the reference's multi-way liftOver star, laned by the page's species.

import { ucscConfigPath } from '../config/jbrowse.ts'
import { loadJsonOnce } from '../lib/fetchJson.ts'
import { type StarIndex, starLane } from '../lib/syntenyStars.ts'
import { specUrl } from './jbrowseLinks.ts'
import { type AssemblyStore, loadStore } from './orthologDb.ts'
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
// star's GC band under each lane (hubtools' starLanePitch): a track this tall
// per lane never scrolls
const LANE_PITCH = 50

// The reference's multi-way synteny star over the window the page draws, one
// lane per species the page shows that the star holds, in the order of `rows`:
// `rows.domain` pins it, since the display otherwise sorts lanes densest-first.
// Undefined where the reference has no star.
export function starUrl(
  refAccession: string | undefined,
  refLoc: string | undefined,
  rows: { taxonId: number; assembly?: string }[],
  { hosted, stars }: DrilldownData,
) {
  const ucscDb = refAccession ? hosted(refAccession)?.ucscDb : undefined
  const starLanes = ucscDb ? stars[ucscDb] : undefined
  if (!ucscDb || !refLoc || !starLanes) {
    return undefined
  }
  const lanes = [
    ...new Set(
      rows
        .map(row => starLane(starLanes, row, hosted))
        .filter((mate): mate is string => mate !== undefined),
    ),
  ]
  return specUrl(ucscConfigPath(ucscDb), [
    {
      type: 'LinearGenomeView',
      assembly: ucscDb,
      loc: refLoc,
      tracks: [
        {
          trackId: `${ucscDb}_liftOver_multiway`,
          type: 'MultiWaySyntenyDisplay',
          ...(lanes.length > 0
            ? {
                rows: { kept: lanes, domain: lanes },
                height: (lanes.length + 1) * LANE_PITCH,
              }
            : {}),
        },
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
// An unloadable catalog rejects, so the page's SWR retries it rather than
// holding an empty index (and no synteny links) until reload; an unloadable
// assembly index answers with the accession verbatim.
export interface DrilldownData {
  index: PairIndex
  hosted: (accession: string) => HostedGenome
  stars: StarIndex
}

function hostedLookup(store: AssemblyStore | undefined) {
  return (accession: string): HostedGenome =>
    store ? store.find(accession) : { accession }
}

// A star index that will not load costs only the star link
function loadStars() {
  return loadJsonOnce<StarIndex>('/synteny_stars.json').catch(
    (): StarIndex => ({}),
  )
}

// What the links fall back to while the catalog fails: each gene opens its own
// genome, as it did before the catalog existed.
export const SINGLE_GENOME_DRILLDOWN: DrilldownData = {
  index: new Map(),
  hosted: hostedLookup(undefined),
  stars: {},
}

export async function loadDrilldownData(): Promise<DrilldownData> {
  const [index, store, stars] = await Promise.all([
    loadPairs(),
    loadStore().catch(() => undefined),
    loadStars(),
  ])
  return { index, hosted: hostedLookup(store), stars }
}

// What the assembly index says about the genome a clicked gene sits on:
// `undefined` when we do not host it, and the accession verbatim when the index
// itself could not be loaded.
export type HostedGenome =
  | { accession: string; ucscDb?: string; geneTrack?: string }
  | undefined

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
export function geneDrilldownUrl(
  gene: PlacedGene,
  refAccession: string | undefined,
  refGene: PlacedGene | undefined,
  index: PairIndex,
  hosted: HostedGenome,
  flipped = false,
) {
  const candidate =
    refAccession && gene.assembly !== refAccession
      ? syntenyLink(index, gene.assembly, refAccession)
      : undefined
  // syntenyLink matches across assembly versions on purpose, which is right for
  // finding a track and wrong for placing a locus: the panel opens under the
  // catalog's name while NCBI reported the gene against whatever version it
  // annotated, and the locstring resolves against neither. Falling back to the
  // single genome beats opening a panel that cannot navigate.
  if (candidate && hosted && isSameGenome(candidate.names[0], hosted)) {
    return pairwiseOrthologUrl(candidate, gene, refGene, flipped)
  }
  return hosted
    ? accessionToJbrowseUrl(
        hosted.accession,
        gene,
        hosted.ucscDb,
        hosted.geneTrack,
      )
    : undefined
}
