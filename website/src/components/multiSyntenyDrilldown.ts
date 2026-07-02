// Drill-downs from the multi-way view into JBrowse:
//  - a clicked gene -> pairwise LinearSyntenyView when a precomputed chain
//    (synteny_pairs.json) links it to the reference, else single-genome;
//  - a clicked branch point -> stacked LinearSyntenyView of the whole subtree;
//  - the reference's hosted whole-genome alignment (e.g. hg38 447-way Cactus).

import { specUrl, syntenyViewUrl } from './jbrowseLinks.ts'
import {
  SYNTENY_FLANK_BP,
  accessionToJbrowseUrl,
  flankLoc,
} from './orthologSearchUtils.ts'
import { type PairIndex, buildPairIndex, trackFor } from './syntenyPairIndex.ts'

import type { PlacedGene } from './neighborhood.ts'

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
    configUrl: 'https://jbrowse.org/ucsc/hg38/config.json',
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

// The pair catalog is fetched once on first drill-down and indexed for tolerant
// (version/suffix/order-insensitive) lookup.
let pairIndex: Promise<PairIndex> | undefined

function loadPairs(): Promise<PairIndex> {
  pairIndex ??= fetch('/synteny_pairs.json')
    .then(res =>
      res.ok ? (res.json() as Promise<Record<string, string>>) : {},
    )
    .then(buildPairIndex)
    .catch(() => {
      pairIndex = undefined // let a later click retry rather than cache the failure
      return new Map<string, string>()
    })
  return pairIndex
}

function pairwiseSyntenyUrl(
  refAccession: string,
  orthoAccession: string,
  loc: string,
  trackId: string,
  refLoc: string | undefined,
) {
  return syntenyViewUrl(
    [
      { assembly: orthoAccession, loc },
      // Land the reference panel on the orthologous locus too, so both genomes
      // open at the gene rather than leaving the reference unnavigated.
      { assembly: refAccession, ...(refLoc ? { loc: refLoc } : {}) },
    ],
    [trackId],
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
// navigated to its ortholog locus, with a synteny track between adjacent genomes
// where a chain exists. JBrowse binds tracks to a level by array position, NOT by
// assemblyNames, so tracks is one slot per level (the gap between picked[i] and
// picked[i+1]); a level with no chain gets an empty slot to keep the rest aligned.
// Pure (no DOM/fetch) so the level binding stays unit-testable. Returns undefined
// for fewer than two genomes.
export function subtreeSyntenyUrl(picked: SubtreeLeaf[], index: PairIndex) {
  if (picked.length < 2) {
    return undefined
  }
  const tracks = picked.slice(0, -1).map((leaf, i) => {
    const trackId = trackFor(index, leaf.assembly, picked[i + 1]!.assembly)
    return trackId ? [trackId] : []
  })
  return syntenyViewUrl(
    picked.map(p => ({ assembly: p.assembly, loc: p.loc })),
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

// Resolve the best JBrowse URL for a clicked gene, then open it. refGene is the
// same anchor's ortholog in the reference, used to navigate the reference panel
// of a pairwise synteny view. A pairwise launch flanks both panels so the
// alignment ribbons are visible instead of landing flush on the gene bounds; the
// single-genome fallback lands on the gene itself.
export async function openGeneDrilldown(
  gene: PlacedGene,
  refAccession: string | undefined,
  refGene: PlacedGene | undefined,
) {
  const index = await loadPairs()
  const trackId =
    refAccession && gene.assembly !== refAccession
      ? trackFor(index, gene.assembly, refAccession)
      : undefined
  const url =
    trackId && refAccession
      ? pairwiseSyntenyUrl(
          refAccession,
          gene.assembly,
          flankLoc(gene.refName, gene.start, gene.end, SYNTENY_FLANK_BP),
          trackId,
          refGene &&
            flankLoc(
              refGene.refName,
              refGene.start,
              refGene.end,
              SYNTENY_FLANK_BP,
            ),
        )
      : accessionToJbrowseUrl(
          gene.assembly,
          `${gene.refName}:${gene.start}-${gene.end}`,
        )
  window.open(url, '_blank', 'noopener')
}
