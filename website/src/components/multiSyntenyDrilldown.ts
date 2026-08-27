// Drill-downs from the multi-way view into JBrowse:
//  - a clicked gene -> pairwise LinearSyntenyView when a precomputed chain
//    (synteny_pairs.json) links it to the reference, else single-genome;
//  - a clicked branch point -> stacked LinearSyntenyView of the whole subtree;
//  - the reference's hosted whole-genome alignment (e.g. hg38 447-way Cactus).

import { ucscConfigPath } from '../config/jbrowse.ts'
import { loadJsonOnce } from '../lib/fetchJson.ts'
import { panelTracks, specUrl, syntenyViewUrl } from './jbrowseLinks.ts'
import { loadStore } from './orthologDb.ts'
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

// NCBI sequence_name -> UCSC chromosome (chr-prefixed; mitochondrion is chrM).
function toUcscChrom(name: string) {
  const n = name === 'MT' ? 'M' : name
  return n.startsWith('chr') ? n : `chr${n}`
}

// Open the reference's hosted whole-genome multi-species alignment at a locus —
// base-level alignment across species, zero compute, when the reference has one.
export function openRefAlignment(refTaxonId: number, gene: PlacedGene) {
  const a = REF_ALIGNMENTS[refTaxonId]
  if (a && gene.chromosome) {
    const loc = `${toUcscChrom(gene.chromosome)}:${gene.start}-${gene.end}`
    window.open(
      specUrl(a.configUrl, [
        {
          type: 'LinearGenomeView',
          assembly: a.ucscDb,
          loc,
          tracks: [a.alignmentTrackId],
        },
      ]),
      '_blank',
      'noopener',
    )
  }
}

// The pair catalog is fetched once on first drill-down (loadJsonOnce shares the
// request and, unlike the old inline fetch, doesn't cache a 404 forever) and
// indexed for tolerant (version/suffix/order-insensitive) lookup. Any load
// failure degrades to an empty index — the click falls back to single-genome —
// and a later drill-down retries.
function loadPairs(): Promise<PairIndex> {
  return loadJsonOnce<Record<string, PairEntry>>('/synteny_pairs.json').then(
    buildPairIndex,
    () => new Map(),
  )
}

// The panel assemblies are the link's names rather than the accessions: a
// comparison against human lives in /ucsc/hg38/config.json and knows that genome
// as `hg38`, so merging by accession would fetch a hub without the track. Each
// panel also opens its own gene track — a synteny sub-view has no defaultSession,
// so without one the panel is an empty browser at the right locus.
function pairwiseSyntenyUrl(
  link: SyntenyLink,
  loc: string,
  refLoc: string | undefined,
) {
  return syntenyViewUrl(
    [
      { assembly: link.names[0], loc, ...panelTracks(link.geneTracks[0]) },
      // Land the reference panel on the orthologous locus too, so both genomes
      // open at the gene rather than leaving the reference unnavigated.
      {
        assembly: link.names[1],
        ...(refLoc ? { loc: refLoc } : {}),
        ...panelTracks(link.geneTracks[1]),
      },
    ],
    [link.trackId],
    { colorBy: 'query', drawCurves: true, autoDiagonalize: true },
  )
}

export interface SubtreeLeaf {
  assembly: string
  loc: string
}

// A multi-level LinearSyntenyView stacks one full genome browser per level, so a
// huge subtree is unreadable; cap the launch to the nearest leaves (tree order).
export const MAX_SUBTREE_GENOMES = 15

// Build a stacked, tree-ordered LinearSyntenyView URL for a subtree, each genome
// navigated to its ortholog locus with its gene track open, and a synteny track
// between adjacent genomes where a chain exists. JBrowse binds tracks to a level by array position, NOT by
// assemblyNames, so tracks is one slot per level (the gap between picked[i] and
// picked[i+1]); a level with no chain gets an empty slot to keep the rest aligned.
// Pure (no DOM/fetch) so the level binding stays unit-testable. Returns undefined
// for fewer than two genomes.
export function subtreeSyntenyUrl(picked: SubtreeLeaf[], index: PairIndex) {
  if (picked.length < 2) {
    return undefined
  }
  const { names, geneTracks, tracks } = resolveStackNames(
    picked.map(p => p.assembly),
    index,
  )
  return syntenyViewUrl(
    picked.map((p, i) => ({
      assembly: names[i] ?? p.assembly,
      loc: p.loc,
      ...panelTracks(geneTracks[i] ?? ''),
    })),
    tracks,
    { drawCurves: true },
  )
}

// Cap the launch to the nearest leaves (tree order) — a multi-level synteny view
// stacks one genome browser per level, so a huge subtree is unreadable.
export async function openSubtreeSynteny(leaves: SubtreeLeaf[]) {
  const url = subtreeSyntenyUrl(
    leaves.slice(0, MAX_SUBTREE_GENOMES),
    await loadPairs(),
  )
  if (url) {
    window.open(url, '_blank', 'noopener')
  }
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
) {
  const [index, hosted] = await Promise.all([
    loadPairs(),
    loadStore().then(
      s => s.find(gene.assembly),
      () => ({ accession: gene.assembly }),
    ),
  ])
  const url = geneDrilldownUrl(gene, refAccession, refGene, index, hosted)
  if (url) {
    window.open(url, '_blank', 'noopener')
  }
}
