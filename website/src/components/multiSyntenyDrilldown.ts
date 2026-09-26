// Drill-downs from the multi-way view into JBrowse:
//  - a clicked gene -> pairwise LinearSyntenyView when a precomputed chain
//    (synteny_pairs.json) links it to the reference, else single-genome;
//  - a clicked branch point -> stacked LinearSyntenyView of the whole subtree;
//  - the reference's hosted whole-genome alignment (e.g. hg38 447-way Cactus);
//  - the reference's multi-way liftOver star, laned by the page's species.

import { ucscConfigPath } from '../config/jbrowse.ts'
import { loadJsonOnce } from '../lib/fetchJson.ts'
import { type StarIndex, starLane } from '../lib/syntenyStars.ts'
import {
  flipLoc,
  panelTracks,
  specUrl,
  syntenyViewUrl,
} from './jbrowseLinks.ts'
import { type AssemblyStore, loadStore } from './orthologDb.ts'
import {
  SYNTENY_FLANK_BP,
  accessionToJbrowseUrl,
  flankLoc,
  isSameGenome,
} from './orthologSearchUtils.ts'
import {
  type PairEntry,
  type PairIndex,
  buildPairIndex,
  resolveStackNames,
  syntenyLink,
} from './syntenyPairIndex.ts'

import type { PlacedGene } from './neighborhood.ts'
import type { SyntenyLink } from './syntenyPairIndex.ts'

// taxId -> a hosted whole-genome alignment for that reference; add entries as
// references gain one. First slice of the GCF<->UCSC-db registry in
// agent-docs/SYNTENY_ALIGNMENT_STRATEGY.md.
export interface RefAlignment {
  ucscDb: string
  configUrl: string
  alignmentTrackId: string
  alignmentLabel: string
}

export const REF_ALIGNMENTS: Record<number, RefAlignment> = {
  9606: {
    ucscDb: 'hg38',
    configUrl: ucscConfigPath('hg38'),
    alignmentTrackId: 'hg38-cactus447way',
    alignmentLabel: '447-way Cactus alignment (Zoonomia)',
  },
}

// The reference's hosted whole-genome multi-species alignment at a gene —
// base-level alignment across species, zero compute, when the reference has one.
// The locus stays on NCBI's sequence accession, which the UCSC config resolves
// through its chromAlias: `chromosome` is a display name that falls back to that
// same accession when NCBI gives none, and prefixing it made `chrNC_000017.11`.
export function refAlignmentUrl(refTaxonId: number, gene: PlacedGene) {
  const a = REF_ALIGNMENTS[refTaxonId]
  return a
    ? specUrl(a.configUrl, [
        {
          type: 'LinearGenomeView',
          assembly: a.ucscDb,
          loc: `${gene.refName}:${gene.start}-${gene.end}`,
          tracks: [a.alignmentTrackId],
        },
      ])
    : undefined
}

// MultiWaySyntenyDisplay's MIN_LANE_PITCH: a track this tall per lane never
// scrolls
const LANE_PITCH = 22

// The reference's multi-way synteny star over the window the page draws, one
// lane per species the page shows that the star holds. Undefined where the
// reference has no star.
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
                laneFilter: { only: lanes },
                height: (lanes.length + 1) * LANE_PITCH,
              }
            : {}),
        },
      ],
    },
  ])
}

export function openRefAlignment(refTaxonId: number, gene: PlacedGene) {
  const url = refAlignmentUrl(refTaxonId, gene)
  if (url) {
    window.open(url, '_blank', 'noopener')
  }
}

// The pair catalog, fetched once and indexed for tolerant
// (version/suffix/order-insensitive) lookup. A failure rejects, and
// loadJsonOnce forgets it, so whoever asks next fetches again.
function loadPairs(): Promise<PairIndex> {
  return loadJsonOnce<Record<string, PairEntry>>('/synteny_pairs.json').then(
    buildPairIndex,
  )
}

// The panel assemblies are the link's names rather than the accessions: a
// comparison against human lives in /ucsc/hg38/config.json and knows that genome
// as `hg38`, so merging by accession would fetch a hub without the track. Each
// panel also opens its own gene track — a synteny sub-view has no defaultSession,
// so without one the panel is an empty browser at the right locus.
//
// `flipped` flips the CLICKED genome's panel and leaves the reference in its own
// coordinates, which is the opposite end from the ortholog page's pairwise launch
// (orthoSyntenyUrl, where the row leads and the reference flips). Both rules are
// "match what the reader is looking at", and here that is a figure already on
// screen: the page mirrors a row whose locus is inverted RELATIVE TO THE
// REFERENCE, so the reference is the frame and the launch has to use the same one
// or it opens mirror-image to the row that was clicked.
function pairwiseSyntenyUrl(
  link: SyntenyLink,
  loc: string,
  refLoc: string | undefined,
  flipped: boolean,
) {
  return syntenyViewUrl(
    [
      {
        assembly: link.names[0],
        loc: flipLoc(loc, flipped),
        ...panelTracks(link.geneTracks[0]),
      },
      // Land the reference panel on the orthologous locus too, so both
      // genomes open at the gene rather than leaving the reference
      // unnavigated.
      {
        assembly: link.names[1],
        ...(refLoc ? { loc: refLoc } : {}),
        ...panelTracks(link.geneTracks[1]),
      },
    ],
    [link.trackId],
    { color: { field: 'query' }, drawCurves: true, autoDiagonalize: true },
  )
}

export interface SubtreeLeaf {
  assembly: string
  loc: string
  // Open this genome's panel horizontally flipped, because the row it came from
  // is drawn mirrored on the page (see `orientToRef` in multiSyntenyLayout.ts).
  flipped?: boolean
}

// A multi-level LinearSyntenyView stacks one full genome browser per level, and
// the merge behind it fetches one full config per genome, so a branch point
// opens this many by default — the leaves nearest the reference — and opening
// the whole clade is a separate, explicit choice that says how many.
export const DEFAULT_SUBTREE_GENOMES = 7

// The `n` items around `center` (tree order runs basal→derived, so a head
// slice of a clade holding the reference would be its most distant members);
// the head of the list when the center is not in it.
export function nearestWindow<T>(items: T[], center: number, n: number) {
  const start = Math.min(
    Math.max(0, (center >= 0 ? center : 0) - Math.floor(n / 2)),
    Math.max(0, items.length - n),
  )
  return items.slice(start, start + n)
}

// A stacked, tree-ordered LinearSyntenyView URL for a subtree: each genome
// navigated to its ortholog locus with its gene track open, and a synteny track
// between adjacent genomes where a chain links them. Pure, so the level binding
// stays unit-testable; undefined for fewer than two genomes.
//
// A leaf's locus is in the assembly NCBI annotated, and `resolveStackNames`
// keeps a level only where the catalog's name for each panel is the genome
// `hosted` resolves that assembly to, the check the gene drill-down makes. A
// panel no level names opens under that hosted genome too, so human still
// opens /ucsc/hg38 rather than a GenArk hub with no sequence.
export function subtreeSyntenyUrl(
  picked: SubtreeLeaf[],
  { index, hosted }: DrilldownData,
) {
  if (picked.length < 2) {
    return undefined
  }
  const genomes = picked.map(p => hosted(p.assembly))
  const { names, geneTracks, tracks } = resolveStackNames(
    picked.map(p => p.assembly),
    index,
    (i, name) => {
      const genome = genomes[i]
      return genome !== undefined && isSameGenome(name, genome)
    },
  )
  return syntenyViewUrl(
    picked.map((p, i) => ({
      assembly:
        names[i] ?? genomes[i]?.ucscDb ?? genomes[i]?.accession ?? p.assembly,
      loc: flipLoc(p.loc, p.flipped ?? false),
      ...panelTracks(geneTracks[i] ?? ''),
    })),
    tracks,
    { drawCurves: true },
  )
}

// The click path for a branch point before the catalog has been prefetched:
// the caller has already chosen which leaves to open.
export async function openSubtreeSynteny(leaves: SubtreeLeaf[]) {
  const url = subtreeSyntenyUrl(leaves, await drilldownForClick())
  if (url) {
    window.open(url, '_blank', 'noopener')
  }
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

export async function loadDrilldownData(): Promise<DrilldownData> {
  const [index, store, stars] = await Promise.all([
    loadPairs(),
    loadStore().catch(() => undefined),
    loadStars(),
  ])
  return { index, hosted: hostedLookup(store), stars }
}

// A click cannot wait for a retry: without the catalog it opens the single
// genome, and the next click asks again.
async function drilldownForClick(): Promise<DrilldownData> {
  const [index, store] = await Promise.all([
    loadPairs().catch((): PairIndex => new Map()),
    loadStore().catch(() => undefined),
  ])
  return { index, hosted: hostedLookup(store), stars: {} }
}

// What the assembly index says about the genome a clicked gene sits on:
// `undefined` when we do not host it, and the accession verbatim when the index
// itself could not be loaded.
export type HostedGenome = { accession: string; ucscDb?: string } | undefined

// The best JBrowse URL for a clicked gene, or undefined when there is nothing of
// ours to open. Pure, like subtreeSyntenyUrl, so the two branches and the guard
// between them stay unit-testable.
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
    return pairwiseSyntenyUrl(
      candidate,
      flankLoc(gene.refName, gene.start, gene.end, SYNTENY_FLANK_BP),
      refGene &&
        flankLoc(refGene.refName, refGene.start, refGene.end, SYNTENY_FLANK_BP),
      flipped,
    )
  }
  return hosted
    ? accessionToJbrowseUrl(
        hosted.accession,
        `${gene.refName}:${gene.start}-${gene.end}`,
        hosted.ucscDb,
      )
    : undefined
}

// Resolve the best JBrowse URL for a clicked gene, then open it. refGene is the
// same anchor's ortholog in the reference, used to navigate the reference panel
// of a pairwise synteny view. A pairwise launch flanks both panels so the
// alignment ribbons are visible instead of landing flush on the gene bounds; the
// single-genome fallback lands on the gene itself.
//
// An index that will not load degrades to the accession verbatim — what this did
// before it consulted the index at all — rather than to a dead click. Only a
// loaded index saying it does not know the accession means "not ours to open".
export async function openGeneDrilldown(
  gene: PlacedGene,
  refAccession: string | undefined,
  refGene: PlacedGene | undefined,
  flipped = false,
) {
  const { index, hosted } = await drilldownForClick()
  const url = geneDrilldownUrl(
    gene,
    refAccession,
    refGene,
    index,
    hosted(gene.assembly),
    flipped,
  )
  if (url) {
    window.open(url, '_blank', 'noopener')
  }
}
