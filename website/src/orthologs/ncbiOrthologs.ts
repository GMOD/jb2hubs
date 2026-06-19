// NCBI-backed ortholog lookups for the synteny gene picker. Gene-name typeahead
// comes from E-utilities (esearch + esummary); cross-species ortholog mapping
// from the NCBI Datasets API. Same-species pairs (taxon1 === taxon2) need no
// mapping — the gene symbol is shared, so both views center on the same symbol.

const EUTILS = 'https://eutils.ncbi.nlm.nih.gov/entrez/eutils'
const DATASETS = 'https://api.ncbi.nlm.nih.gov/datasets/v2'

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url)
  if (!res.ok) {
    throw new Error(`NCBI request failed: ${res.status} ${res.statusText}`)
  }
  return res.json() as Promise<T>
}

export interface GeneHit {
  geneId: string
  symbol: string
}

// Gene-name prefix typeahead within one taxon, resolved to symbols.
export async function searchGenes(
  query: string,
  taxId: number,
  limit = 10,
): Promise<GeneHit[]> {
  const q = query.trim()
  let hits: GeneHit[] = []
  if (q) {
    const term = `${q}*[Gene Name] AND ${taxId}[taxid]`
    const search = await fetchJson<{ esearchresult?: { idlist?: string[] } }>(
      `${EUTILS}/esearch.fcgi?db=gene&term=${encodeURIComponent(term)}&retmode=json&retmax=${limit}`,
    )
    const ids = search.esearchresult?.idlist ?? []
    if (ids.length > 0) {
      const summary = await fetchJson<{
        result?: Record<string, { name?: string }>
      }>(`${EUTILS}/esummary.fcgi?db=gene&id=${ids.join(',')}&retmode=json`)
      const result = summary.result ?? {}
      hits = ids
        .map(id => ({ geneId: id, symbol: result[id]?.name ?? '' }))
        .filter(h => h.symbol)
    }
  }
  return hits
}

interface OrthologResponse {
  reports?: { gene: { tax_id: string; symbol: string } }[]
}

// The orthologous gene symbol for `geneId` in `targetTax`, or null if NCBI lists
// no ortholog there.
export async function orthologSymbol(
  geneId: string,
  targetTax: number,
): Promise<string | null> {
  const data = await fetchJson<OrthologResponse>(
    `${DATASETS}/gene/id/${geneId}/orthologs?returned_content=COMPLETE`,
  )
  const match = (data.reports ?? []).find(
    r => Number(r.gene.tax_id) === targetTax,
  )
  return match ? match.gene.symbol : null
}
