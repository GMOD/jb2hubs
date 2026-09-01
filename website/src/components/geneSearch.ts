// Gene-symbol type-ahead. mygene.info indexes every species by NCBI taxon id and
// answers a prefix query in one call, which is why the suggestions come from
// there rather than from E-utils: NCBI's own search would cost a throttled
// request per keystroke out of the same ~3/s budget the gene resolution needs.
//
// It is suggestions only. Nothing downstream trusts these strings — the gene is
// still resolved through NCBI Datasets, which is what decides whether it exists.
//
// A hit carries the NCBI GeneID where mygene knows one, because the synteny
// picker needs an id to resolve the ortholog in the second taxon. The picker
// used to run its own E-utils typeahead for that (esearch + esummary, two
// throttled calls per query); mygene answers the same question in one call that
// costs NCBI's budget nothing.

import { fetchOrthologReports } from './ncbiFetch.ts'

const MYGENE = 'https://mygene.info/v3'

export interface GeneHit {
  symbol: string
  // absent for a record mygene holds from Ensembl only — see searchGenes
  geneId?: string
}

// A picked gene as one string, "<NCBI GeneID>:<symbol>" — the id is what an
// ortholog lookup needs and the symbol is what the reader sees, so a link can
// carry both and re-resolve the ortholog on load without a search. GeneIDs are
// numeric, so the first colon is the divider whatever the symbol holds.
export function encodeGeneRef(geneId: string, symbol: string) {
  return `${geneId}:${symbol}`
}

export function parseGeneRef(ref: string) {
  const match = /^(\d+):(.+)$/.exec(ref)
  return match ? { geneId: match[1]!, symbol: match[2]! } : undefined
}

interface MyGeneQuery {
  hits?: { symbol?: string; entrezgene?: string | number }[]
}

// mygene's prefix search does not rank the obvious answer first: `symbol:TP5*`
// in human returns TP53TG3C, TP53TG1, TP53RK… and buries TP53. So rank here —
// an exact hit, then shortest (the base symbol, before any suffix), then
// alphabetically to keep the order stable between identical-length siblings.
export function rankSymbols(symbols: string[], query: string): string[] {
  const q = query.trim().toLowerCase()
  return [...new Set(symbols)].sort((a, b) => {
    const exact = Number(b.toLowerCase() === q) - Number(a.toLowerCase() === q)
    return exact || a.length - b.length || a.localeCompare(b)
  })
}

// One hit per symbol, keeping whichever carries an NCBI GeneID. mygene returns a
// record per source, so a symbol Ensembl and NCBI both know comes back twice —
// human `symbol:BRCA*` yields BRCA1P1 as both `ENSG00000267595` (no
// `entrezgene`) and `394269` (with one). Taking the first would show the symbol
// twice and half the time hand the synteny picker no id to resolve with.
export function dedupeHits(
  hits: { symbol?: string; entrezgene?: string | number }[],
): GeneHit[] {
  const bySymbol = new Map<string, GeneHit>()
  for (const h of hits) {
    if (h.symbol && !bySymbol.get(h.symbol)?.geneId) {
      bySymbol.set(h.symbol, {
        symbol: h.symbol,
        geneId: h.entrezgene === undefined ? undefined : String(h.entrezgene),
      })
    }
  }
  return [...bySymbol.values()]
}

// Symbols starting with the typed prefix, in the species. Rejects when mygene
// cannot be reached or answers with an error, so a caller can tell an outage
// from "no gene starts with that" — the two read identically as an empty list.
export async function queryGenes(
  query: string,
  taxId: number,
  limit = 10,
): Promise<GeneHit[]> {
  const q = encodeURIComponent(`symbol:${query}*`)
  const url = `${MYGENE}/query?q=${q}&species=${taxId}&fields=symbol,entrezgene&size=${limit * 2}`
  const res = await fetch(url)
  if (!res.ok) {
    throw new Error(`mygene.info answered ${res.status} for ${query}`)
  }
  const json = (await res.json()) as MyGeneQuery
  const hits = dedupeHits(json.hits ?? [])
  const bySymbol = new Map(hits.map(h => [h.symbol, h]))
  return rankSymbols([...bySymbol.keys()], query)
    .map(s => bySymbol.get(s)!)
    .slice(0, limit)
}

// queryGenes, best-effort: a failed lookup means no suggestions, never an
// error — someone can always type the whole symbol.
export async function searchGenes(query: string, taxId: number, limit = 10) {
  return queryGenes(query, taxId, limit).catch((): GeneHit[] => [])
}

// The gene's symbol in another species, so switching the reference organism can
// keep the gene someone was looking at instead of emptying the box, and so the
// synteny picker can center both of its views on the same gene. Symbols do not
// carry across organisms (TP53 / Trp53 / tp53), which is why this is a lookup
// and not a case transform. Best-effort — NCBI's ortholog sets are vertebrate-
// and insect-scoped, so a yeast, worm or plant target resolves nothing and the
// caller simply gets undefined.
//
// Asks for the one taxon rather than fetching every ortholog and filtering the
// answer, which is what the synteny picker's own copy of this used to do.
//
// Rejects on a failed request. "NCBI answered and there is no ortholog" and
// "NCBI did not answer" are different facts — the synteny picker shows the
// first as no ortholog and the second as an error to retry — and the
// best-effort wrapper below is for callers that treat both as nothing.
export async function resolveOrthologSymbol(
  geneId: string,
  taxId: number,
): Promise<string | undefined> {
  const json = await fetchOrthologReports<{
    reports?: { gene?: { symbol?: string } }[]
  }>(geneId, [taxId])
  return json.reports?.[0]?.gene?.symbol
}

export async function fetchOrthologSymbol(geneId: string, taxId: number) {
  return resolveOrthologSymbol(geneId, taxId).catch(
    (): string | undefined => undefined,
  )
}
