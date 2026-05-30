import { rankBy } from '../utils/rankOptions.ts'

// One orthologous gene pair, oriented to a query: gene1 is the symbol in the
// caller's first taxon, gene2 the symbol in the second.
export interface OrthologGene {
  gene1: string
  gene2: string
}

export interface OrthologGeneQuery {
  taxon1: number
  taxon2: number
  // Fuzzy search over the first taxon's gene symbols; empty returns the head.
  search: string
  limit?: number
}

// Database-like access to the cross-species ortholog tables, decoupled from
// React and from the storage format. The static-file implementation below
// reads the per-pair TSVs shipped under public/orthologs/, but a REST/lambda
// or tabix-backed implementation can satisfy the same interface unchanged.
export interface OrthologGeneAdapter {
  // Is there a table for this unordered taxon pair at all?
  hasPair(taxon1: number, taxon2: number): boolean
  // Query orthologous genes, oriented to taxon1, ranked by `search`, capped.
  queryGenes(query: OrthologGeneQuery): Promise<OrthologGene[]>
}

// Canonical taxon-pair key, matching orthologs/src/buildOrthologTable.ts.
export function pairKey(a: number, b: number) {
  return `${Math.min(a, b)}_${Math.max(a, b)}`
}

// Backs OrthologGeneAdapter with the static per-pair TSVs. Each file is named
// <loTax>_<hiTax>.tsv with `loSym<TAB>hiSym` rows; the loaded "canonical" rows
// are cached and oriented per query.
export class StaticFileOrthologAdapter implements OrthologGeneAdapter {
  private readonly pairs: Set<string>
  private readonly baseUrl: string
  // canonical (lo->hi oriented) rows per pair key, deduped on load
  private readonly cache = new Map<string, Promise<OrthologGene[]>>()

  constructor(pairs: string[], baseUrl = '/orthologs') {
    this.pairs = new Set(pairs)
    this.baseUrl = baseUrl
  }

  hasPair(taxon1: number, taxon2: number) {
    return this.pairs.has(pairKey(taxon1, taxon2))
  }

  private loadCanonical(key: string) {
    const existing = this.cache.get(key)
    const promise =
      existing ??
      fetch(`${this.baseUrl}/${key}.tsv`)
        .then(res => (res.ok ? res.text() : ''))
        .then(text =>
          text
            .split('\n')
            .filter(Boolean)
            .map(line => {
              const [loSym, hiSym] = line.split('\t')
              return { gene1: loSym!, gene2: hiSym! }
            }),
        )
        .catch(() => [] as OrthologGene[])
    if (!existing) {
      this.cache.set(key, promise)
    }
    return promise
  }

  async queryGenes({ taxon1, taxon2, search, limit = 100 }: OrthologGeneQuery) {
    let result: OrthologGene[] = []
    if (taxon1 !== taxon2 && this.hasPair(taxon1, taxon2)) {
      const canonical = await this.loadCanonical(pairKey(taxon1, taxon2))
      const taxon1IsLo = Math.min(taxon1, taxon2) === taxon1
      const oriented = taxon1IsLo
        ? canonical
        : canonical.map(r => ({ gene1: r.gene2, gene2: r.gene1 }))

      // One row per distinct first-taxon symbol, then fuzzy-rank by it.
      const seen = new Set<string>()
      const deduped: OrthologGene[] = []
      for (const row of oriented) {
        if (!seen.has(row.gene1)) {
          seen.add(row.gene1)
          deduped.push(row)
        }
      }
      result = rankBy(search, deduped, r => r.gene1, limit)
    }
    return result
  }
}
