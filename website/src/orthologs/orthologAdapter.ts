import { rankBy } from '../utils/rankOptions.ts'

// One gene pair, oriented to a query: gene1 is the symbol in the caller's first
// taxon, gene2 the symbol in the second. For same-species queries gene1 ===
// gene2 (the same gene in both assemblies).
export interface OrthologGene {
  gene1: string
  gene2: string
}

export interface OrthologGeneQuery {
  taxon1: number
  taxon2: number
  // Fuzzy search over the first taxon's gene symbols (and synonyms, for
  // same-species); empty returns the head.
  search: string
  limit?: number
}

// Database-like access to the gene comparison tables, decoupled from React and
// from the storage format. The static-file implementation below reads the
// per-pair / per-taxon files shipped under public/orthologs/, but a REST/lambda
// or tabix-backed implementation can satisfy the same interface unchanged.
export interface OrthologGeneAdapter {
  // Is there a table for this taxon (same-species) or unordered pair at all?
  hasPair(taxon1: number, taxon2: number): boolean
  // Query genes, oriented to taxon1, ranked by `search`, capped.
  queryGenes(query: OrthologGeneQuery): Promise<OrthologGene[]>
}

// Canonical taxon-pair key, matching orthologs/src/buildOrthologTable.ts.
export function pairKey(a: number, b: number) {
  return `${Math.min(a, b)}_${Math.max(a, b)}`
}

// Internal candidate carrying the text to rank on (symbol + synonyms).
interface Candidate extends OrthologGene {
  searchText: string
}

// Backs OrthologGeneAdapter with the static files written by the builder:
// cross-species `<lo>_<hi>.tsv` (loSym<TAB>hiSym) and same-species
// `<tax>.tsv` (symbol<TAB>synonyms). Parsed candidate lists are cached, keyed
// so the two orientations of a cross-species pair don't collide.
export class StaticFileOrthologAdapter implements OrthologGeneAdapter {
  private readonly pairs: Set<string>
  private readonly taxa: Set<number>
  private readonly baseUrl: string
  private readonly cache = new Map<string, Promise<Candidate[]>>()

  constructor(pairs: string[], taxa: number[], baseUrl = '/orthologs') {
    this.pairs = new Set(pairs)
    this.taxa = new Set(taxa)
    this.baseUrl = baseUrl
  }

  hasPair(taxon1: number, taxon2: number) {
    return taxon1 === taxon2
      ? this.taxa.has(taxon1)
      : this.pairs.has(pairKey(taxon1, taxon2))
  }

  private load(
    cacheKey: string,
    file: string,
    parse: (text: string) => Candidate[],
  ) {
    const existing = this.cache.get(cacheKey)
    const promise =
      existing ??
      fetch(`${this.baseUrl}/${file}`)
        .then(res => (res.ok ? res.text() : ''))
        .then(parse)
        .catch(() => [] as Candidate[])
    if (!existing) {
      this.cache.set(cacheKey, promise)
    }
    return promise
  }

  private candidates(taxon1: number, taxon2: number) {
    let candidates: Promise<Candidate[]> = Promise.resolve([])
    if (taxon1 === taxon2) {
      if (this.taxa.has(taxon1)) {
        candidates = this.load(`${taxon1}`, `${taxon1}.tsv`, parseTaxon)
      }
    } else if (this.pairs.has(pairKey(taxon1, taxon2))) {
      const key = pairKey(taxon1, taxon2)
      const taxon1IsLo = taxon1 < taxon2
      candidates = this.load(`${key}:${taxon1IsLo ? 'lo' : 'hi'}`, `${key}.tsv`, text =>
        parsePair(text, taxon1IsLo),
      )
    }
    return candidates
  }

  async queryGenes({ taxon1, taxon2, search, limit = 100 }: OrthologGeneQuery) {
    const candidates = await this.candidates(taxon1, taxon2)
    return rankBy(search, candidates, c => c.searchText, limit).map(c => ({
      gene1: c.gene1,
      gene2: c.gene2,
    }))
  }
}

// same-species: symbol<TAB>synonyms; both views navigate to the symbol
function parseTaxon(text: string): Candidate[] {
  return text
    .split('\n')
    .filter(Boolean)
    .map(line => {
      const [symbol, synonyms] = line.split('\t')
      return {
        gene1: symbol!,
        gene2: symbol!,
        searchText: synonyms ? `${symbol} ${synonyms}` : symbol!,
      }
    })
}

// cross-species: loSym<TAB>hiSym, oriented to taxon1 and deduped by its symbol
function parsePair(text: string, taxon1IsLo: boolean): Candidate[] {
  const seen = new Set<string>()
  const out: Candidate[] = []
  for (const line of text.split('\n')) {
    if (line) {
      const [loSym, hiSym] = line.split('\t')
      const gene1 = taxon1IsLo ? loSym! : hiSym!
      const gene2 = taxon1IsLo ? hiSym! : loSym!
      if (!seen.has(gene1)) {
        seen.add(gene1)
        out.push({ gene1, gene2, searchText: gene1 })
      }
    }
  }
  return out
}
