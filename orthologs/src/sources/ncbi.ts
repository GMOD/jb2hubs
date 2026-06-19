/* eslint-disable no-console */
import { createReadStream } from 'node:fs'
import { join } from 'node:path'
import { createInterface } from 'node:readline'
import { createGunzip } from 'node:zlib'

import type { Contribution, OrthologSource, Wanted } from './types.ts'

// NCBI Gene source. Joins gene_orthologs.gz (cross-species ortholog edges) and
// gene_info.gz (GeneID -> Symbol, plus per-taxon symbol+synonyms for the same-
// species tables) into a Contribution. Both files come from downloadOrthologData.sh.
//
//   gene_orthologs.gz  tax_id, GeneID, relationship, Other_tax_id, Other_GeneID
//   gene_info.gz       tax_id, GeneID, Symbol, LocusTag, Synonyms, ...

const ORTHOLOG_DATA_DIR =
  process.env.ORTHOLOG_DATA_DIR ?? '/mnt/sdb/cdiesh/orthologs'

function pairKey(a: number, b: number) {
  return `${Math.min(a, b)}_${Math.max(a, b)}`
}

async function* gzipLines(path: string) {
  const rl = createInterface({
    input: createReadStream(path).pipe(createGunzip()),
    crlfDelay: Infinity,
  })
  for await (const line of rl) {
    yield line
  }
}

interface Edge {
  key: string
  loGene: number
  hiGene: number
}

// Pass over gene_orthologs.gz collecting only Ortholog edges whose unordered
// taxon pair is wanted. Orients each edge to the lo taxon and records the
// GeneIDs whose symbols must be resolved.
async function loadEdges(wantedPairs: Set<string>) {
  const edges: Edge[] = []
  const neededGenes = new Set<number>()
  let scanned = 0
  for await (const line of gzipLines(
    join(ORTHOLOG_DATA_DIR, 'gene_orthologs.gz'),
  )) {
    if (!line.startsWith('#')) {
      scanned++
      const [taxId, geneId, relationship, otherTax, otherGene] =
        line.split('\t')
      if (relationship === 'Ortholog') {
        const t1 = +taxId!
        const t2 = +otherTax!
        const key = pairKey(t1, t2)
        if (t1 !== t2 && wantedPairs.has(key)) {
          const g1 = +geneId!
          const g2 = +otherGene!
          const loTax = Math.min(t1, t2)
          const loGene = t1 === loTax ? g1 : g2
          const hiGene = t1 === loTax ? g2 : g1
          edges.push({ key, loGene, hiGene })
          neededGenes.add(g1)
          neededGenes.add(g2)
        }
      }
    }
  }
  console.log(
    `scanned ${scanned} ortholog rows, kept ${edges.length} edges, ${neededGenes.size} genes to resolve`,
  )
  return { edges, neededGenes }
}

// Single pass over gene_info.gz: resolve symbols for the needed cross-species
// genes, and collect symbol + synonyms for every gene of each same-species
// taxon. Columns are sliced incrementally so the per-line work stays cheap on a
// multi-GB file.
async function loadGeneInfo(neededGenes: Set<number>, sameTaxa: Set<number>) {
  const symbols = new Map<number, string>()
  const taxonGenes = new Map<number, Map<string, string>>()
  for await (const line of gzipLines(join(ORTHOLOG_DATA_DIR, 'gene_info.gz'))) {
    if (!line.startsWith('#')) {
      const tab1 = line.indexOf('\t')
      const tab2 = line.indexOf('\t', tab1 + 1)
      const taxId = +line.slice(0, tab1)
      const geneId = +line.slice(tab1 + 1, tab2)
      const needSymbol = neededGenes.has(geneId)
      const sameSpecies = sameTaxa.has(taxId)
      if (needSymbol || sameSpecies) {
        const tab3 = line.indexOf('\t', tab2 + 1)
        const symbol = line.slice(tab2 + 1, tab3)
        if (needSymbol) {
          symbols.set(geneId, symbol)
        }
        if (sameSpecies && symbol && symbol !== '-' && symbol !== 'NEWENTRY') {
          const tab4 = line.indexOf('\t', tab3 + 1)
          const tab5 = line.indexOf('\t', tab4 + 1)
          const rawSynonyms = line.slice(tab4 + 1, tab5)
          const synonyms = rawSynonyms === '-' ? '' : rawSynonyms
          const genes = taxonGenes.get(taxId) ?? new Map<string, string>()
          genes.set(symbol, synonyms)
          taxonGenes.set(taxId, genes)
        }
      }
    }
  }
  console.log(
    `resolved ${symbols.size} symbols, ${taxonGenes.size} same-species taxa`,
  )
  return { symbols, taxonGenes }
}

export const ncbiSource: OrthologSource = {
  name: 'NCBI Gene',
  async gather(wanted: Wanted): Promise<Contribution> {
    const { edges, neededGenes } = await loadEdges(wanted.pairs)
    const { symbols, taxonGenes } = await loadGeneInfo(
      neededGenes,
      wanted.sameTaxa,
    )

    // Group resolved symbol pairs per taxon-pair, de-duplicating identical
    // rows that arise from the bidirectional ortholog records.
    const pairRows = new Map<string, Set<string>>()
    for (const edge of edges) {
      const loSym = symbols.get(edge.loGene)
      const hiSym = symbols.get(edge.hiGene)
      if (loSym && hiSym) {
        const rows = pairRows.get(edge.key) ?? new Set<string>()
        rows.add(`${loSym}\t${hiSym}`)
        pairRows.set(edge.key, rows)
      }
    }

    return { pairRows, taxonGenes }
  },
}
