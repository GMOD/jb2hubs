// Gene-symbol type-ahead. mygene.info indexes every species by NCBI taxon id and
// answers a prefix query in one call, which is why the suggestions come from
// there rather than from E-utils: NCBI's own search would cost a throttled
// request per keystroke out of the same ~3/s budget the gene resolution needs.
//
// It is suggestions only. Nothing downstream trusts these strings — the gene is
// still resolved through NCBI Datasets, which is what decides whether it exists.

import { DATASETS, ncbiJson } from './ncbiFetch.ts'

const MYGENE = 'https://mygene.info/v3'

interface MyGeneQuery {
  hits?: { symbol?: string }[]
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

// Symbols starting with the typed prefix, in the species. Best-effort: a failed
// lookup means no suggestions, never an error — someone can always type the
// whole symbol.
export async function searchGenes(
  query: string,
  taxId: number,
  limit = 10,
): Promise<string[]> {
  const q = encodeURIComponent(`symbol:${query}*`)
  const url = `${MYGENE}/query?q=${q}&species=${taxId}&fields=symbol&size=${limit * 2}`
  const res = await fetch(url).catch(() => undefined)
  if (!res?.ok) {
    return []
  }
  const json = (await res.json()) as MyGeneQuery
  const symbols = (json.hits ?? [])
    .map(h => h.symbol)
    .filter((s): s is string => !!s)
  return rankSymbols(symbols, query).slice(0, limit)
}

interface OrthologSymbolReport {
  reports?: { gene?: { symbol?: string } }[]
}

// The gene's symbol in another species, so switching the reference organism can
// keep the gene someone was looking at instead of emptying the box. Symbols do
// not carry across organisms (TP53 / Trp53 / tp53), which is why this is a
// lookup and not a case transform. Best-effort — NCBI's ortholog sets are
// vertebrate- and insect-scoped, so a yeast, worm or plant target resolves
// nothing and the box simply stays empty.
export async function fetchOrthologSymbol(
  geneId: string,
  taxId: number,
): Promise<string | undefined> {
  const json = await ncbiJson<OrthologSymbolReport>(
    `${DATASETS}/gene/id/${geneId}/orthologs?taxon_filter=${taxId}`,
  ).catch(() => undefined)
  return json?.reports?.[0]?.gene?.symbol
}
