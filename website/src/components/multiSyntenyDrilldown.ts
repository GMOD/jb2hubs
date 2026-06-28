// Drill-down from a gene in the multi-way view into JBrowse. If a precomputed
// pairwise synteny track (UCSC/GenArk chain -> PIF, catalogued in
// synteny_pairs.json) exists between the clicked species and the reference, open
// a LinearSyntenyView showing the real base-level ribbons; otherwise fall back to
// the single-genome view at the gene locus. The overview is orthologs-only, so
// this is where chains add value when present.

import { accessionToJbrowseUrl } from './orthologSearchUtils.ts'

import type { PlacedGene } from './neighborhood.ts'

const MERGE_API = 'https://0hifvzakej.execute-api.us-east-1.amazonaws.com/merge'

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
  const x = accessionBase(a)
  const y = accessionBase(b)
  return index.get(`${x}|${y}`) ?? index.get(`${y}|${x}`)
}

function pairwiseSyntenyUrl(
  refAccession: string,
  orthoAccession: string,
  loc: string,
  trackId: string,
) {
  const mergeApiUrl = `${MERGE_API}?hubIds=${orthoAccession},${refAccession}`
  const sessionSpec = {
    views: [
      {
        type: 'LinearSyntenyView',
        tracks: [trackId],
        views: [
          { assembly: orthoAccession, loc },
          { assembly: refAccession },
        ],
        colorBy: 'query',
        drawCurves: true,
        autoDiagonalize: true,
      },
    ],
  }
  return `https://jbrowse.org/code/jb2/main/?config=${encodeURIComponent(mergeApiUrl)}&session=spec-${encodeURIComponent(JSON.stringify(sessionSpec))}`
}

// Resolve the best JBrowse URL for a clicked gene, then open it.
export async function openGeneDrilldown(
  gene: PlacedGene,
  refAccession: string | undefined,
) {
  const loc = `${gene.refName}:${gene.start}-${gene.end}`
  const index = await loadPairs()
  const trackId =
    refAccession && gene.assembly !== refAccession
      ? trackFor(index, gene.assembly, refAccession)
      : undefined
  const url =
    trackId && refAccession
      ? pairwiseSyntenyUrl(refAccession, gene.assembly, loc, trackId)
      : accessionToJbrowseUrl(gene.assembly, loc)
  window.open(url, '_blank', 'noopener')
}
