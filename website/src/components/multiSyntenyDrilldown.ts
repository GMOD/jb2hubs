// Drill-downs from the multi-way view into JBrowse:
//  - a clicked gene -> pairwise LinearSyntenyView when a precomputed chain
//    (synteny_pairs.json) links it to the reference, else single-genome;
//  - a clicked branch point -> stacked LinearSyntenyView of the whole subtree;
//  - the reference's hosted whole-genome alignment (e.g. hg38 447-way Cactus).

import { mergeConfig, specUrl } from './jbrowseLinks.ts'
import { accessionToJbrowseUrl } from './orthologSearchUtils.ts'

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

// Version-stripped GCF/GCA base, e.g. GCF_000001405.40 or
// GCF_000001735.4_TAIR10.1 -> GCF_000001405 / GCF_000001735, so accessions match
// regardless of version or assembly-name suffix.
function accessionBase(accession: string) {
  const [prefix, id] = accession.split('_')
  return prefix && id ? `${prefix}_${id.replace(/\.\d+$/, '')}` : accession
}

// synteny_pairs.json is "${assemblyName1},${assemblyName2}" -> trackId. Index it
// by base-accession pair for tolerant lookup, fetched once on first drill-down.
type PairIndex = Map<string, string>
let pairIndex: Promise<PairIndex> | undefined

function buildIndex(pairs: Record<string, string>): PairIndex {
  const index: PairIndex = new Map()
  for (const [key, trackId] of Object.entries(pairs)) {
    const [a, b] = key.split(',')
    if (a && b) {
      index.set(`${accessionBase(a)}|${accessionBase(b)}`, trackId)
    }
  }
  return index
}

function loadPairs(): Promise<PairIndex> {
  pairIndex ??= fetch('/synteny_pairs.json')
    .then(res => (res.ok ? (res.json() as Promise<Record<string, string>>) : {}))
    .then(buildIndex)
    .catch(() => {
      pairIndex = undefined // let a later click retry rather than cache the failure
      return new Map<string, string>()
    })
  return pairIndex
}

function trackFor(index: PairIndex, a: string, b: string) {
  return (
    index.get(`${accessionBase(a)}|${accessionBase(b)}`) ??
    index.get(`${accessionBase(b)}|${accessionBase(a)}`)
  )
}

function pairwiseSyntenyUrl(
  refAccession: string,
  orthoAccession: string,
  loc: string,
  trackId: string,
  refLoc: string | undefined,
) {
  return specUrl(mergeConfig([orthoAccession, refAccession]), [
    {
      type: 'LinearSyntenyView',
      tracks: [trackId],
      views: [
        { assembly: orthoAccession, loc },
        // Land the reference panel on the orthologous locus too, so both
        // genomes open at the gene rather than leaving the reference unnavigated.
        { assembly: refAccession, ...(refLoc ? { loc: refLoc } : {}) },
      ],
      colorBy: 'query',
      drawCurves: true,
      autoDiagonalize: true,
    },
  ])
}

export interface SubtreeLeaf {
  assembly: string
  loc: string
}

// A multi-level LinearSyntenyView stacks one full genome browser per level, so a
// huge subtree is unreadable; cap the launch to the nearest leaves (tree order).
export const MAX_SUBTREE_GENOMES = 15

// Launch a stacked, tree-ordered LinearSyntenyView of a whole subtree, each
// genome navigated to its ortholog locus, with synteny tracks between adjacent
// genomes where a chain exists. JBrowse matches each track to its level by the
// track's assemblyNames, so passing the found tracks (any order) is fine.
export async function openSubtreeSynteny(leaves: SubtreeLeaf[]) {
  const picked = leaves.slice(0, MAX_SUBTREE_GENOMES)
  if (picked.length >= 2) {
    const index = await loadPairs()
    const tracks: string[] = []
    for (let i = 0; i < picked.length - 1; i++) {
      const trackId = trackFor(index, picked[i]!.assembly, picked[i + 1]!.assembly)
      if (trackId) {
        tracks.push(trackId)
      }
    }
    window.open(
      specUrl(mergeConfig(picked.map(p => p.assembly)), [
        {
          type: 'LinearSyntenyView',
          tracks,
          views: picked.map(p => ({ assembly: p.assembly, loc: p.loc })),
          drawCurves: true,
        },
      ]),
      '_blank',
      'noopener',
    )
  }
}

// Resolve the best JBrowse URL for a clicked gene, then open it. refLoc is the
// same anchor's locus in the reference, used to navigate the reference panel of
// a pairwise synteny view.
export async function openGeneDrilldown(
  gene: PlacedGene,
  refAccession: string | undefined,
  refLoc: string | undefined,
) {
  const loc = `${gene.refName}:${gene.start}-${gene.end}`
  const index = await loadPairs()
  const trackId =
    refAccession && gene.assembly !== refAccession
      ? trackFor(index, gene.assembly, refAccession)
      : undefined
  const url =
    trackId && refAccession
      ? pairwiseSyntenyUrl(refAccession, gene.assembly, loc, trackId, refLoc)
      : accessionToJbrowseUrl(gene.assembly, loc)
  window.open(url, '_blank', 'noopener')
}
