import { DATASETS, ncbiJson } from './ncbiFetch.ts'

interface Exon {
  begin?: string
  end?: string
  orientation?: string
  order?: number
}

export interface ProductTranscript {
  cds?: { range?: { begin?: string; end?: string }[] }
  genomic_locations?: {
    genomic_accession_version?: string
    exons?: Exon[]
  }[]
}

interface ProductReport {
  product?: { gene_id?: string; transcripts?: ProductTranscript[] }
}

const BATCH = 1000

function toGenome(exons: Exon[], pos: number) {
  let before = 0
  for (const e of exons) {
    const begin = Number(e.begin)
    const end = Number(e.end)
    const len = end - begin + 1
    if (pos <= before + len) {
      const offset = pos - before - 1
      return e.orientation === 'minus' ? end - offset : begin + offset
    }
    before += len
  }
  return undefined
}

// The genomic bounds of a transcript's CDS on one sequence. NCBI gives the CDS
// in transcript coordinates and the exons in transcript order.
function cdsBounds(t: ProductTranscript, refName: string) {
  const range = t.cds?.range ?? []
  const exons = [
    ...(t.genomic_locations?.find(l => l.genomic_accession_version === refName)
      ?.exons ?? []),
  ].sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
  if (range.length === 0 || exons.length === 0) {
    return undefined
  }
  const first = toGenome(exons, Math.min(...range.map(r => Number(r.begin))))
  const last = toGenome(exons, Math.max(...range.map(r => Number(r.end))))
  return first === undefined || last === undefined
    ? undefined
    : { start: Math.min(first, last), end: Math.max(first, last) }
}

// The union of each gene's coding transcripts' CDS bounds on refName, keyed by
// GeneID. A gene without a coding transcript there is left out.
export function codingExtents(
  reports: ProductReport[],
  refNames: Map<string, string>,
) {
  const out = new Map<string, { start: number; end: number }>()
  for (const { product } of reports) {
    const geneId = product?.gene_id
    const refName = geneId ? refNames.get(geneId) : undefined
    if (geneId && refName) {
      for (const t of product.transcripts ?? []) {
        const b = cdsBounds(t, refName)
        if (b) {
          const prev = out.get(geneId)
          out.set(
            geneId,
            prev
              ? {
                  start: Math.min(prev.start, b.start),
                  end: Math.max(prev.end, b.end),
                }
              : b,
          )
        }
      }
    }
  }
  return out
}

// refNames maps each GeneID to the sequence it is placed on.
export async function fetchCodingExtents(refNames: Map<string, string>) {
  const ids = [...refNames.keys()].map(Number)
  const reports: ProductReport[] = []
  for (let i = 0; i < ids.length; i += BATCH) {
    const json = await ncbiJson<{ reports?: ProductReport[] }>(
      `${DATASETS}/gene/product_report`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          gene_ids: ids.slice(i, i + BATCH),
          page_size: BATCH,
        }),
      },
    )
    reports.push(...(json.reports ?? []))
  }
  return codingExtents(reports, refNames)
}
