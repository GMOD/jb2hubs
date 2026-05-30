#!/usr/bin/env node
/* eslint-disable no-console */
import { createReadStream } from 'node:fs'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { createInterface } from 'node:readline'
import { createGunzip } from 'node:zlib'

// Builds cross-species gene ortholog mappings, scoped to taxon pairs that
// already have a synteny track (so the resulting gene comparison always has an
// alignment to load alongside it). Reads the NCBI Gene tables downloaded by
// downloadOrthologData.sh and writes one TSV per taxon pair plus a manifest.
//
// Output orientation is canonical: each pair file is named <loTax>_<hiTax>.tsv
// and every line is `loTaxSymbol<TAB>hiTaxSymbol`. The website maps its two
// chosen assemblies to taxon ids, orders them, and fetches the matching file.

const ORTHOLOG_DATA_DIR =
  process.env.ORTHOLOG_DATA_DIR ?? '/mnt/sdb/cdiesh/orthologs'
const SYNTENY_TRACKS = 'website/src/syntenyTracks.json'
const OUTPUT_DIR = 'website/public/orthologs'
const MANIFEST = 'website/src/orthologManifest.json'

interface SyntenyInput {
  tracks: { assemblyNames: string[] }[]
  assemblyInfo: Record<string, { taxonId?: number }>
}

function pairKey(a: number, b: number) {
  const lo = Math.min(a, b)
  const hi = Math.max(a, b)
  return `${lo}_${hi}`
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

// Taxon pairs that have at least one synteny track, derived from the assembly
// pairs in syntenyTracks.json mapped through each assembly's taxonId.
async function loadWantedPairs() {
  const synteny: SyntenyInput = JSON.parse(
    await readFile(SYNTENY_TRACKS, 'utf8'),
  )
  const wanted = new Set<string>()
  let withTaxa = 0
  for (const track of synteny.tracks) {
    if (track.assemblyNames.length === 2) {
      const [a, b] = track.assemblyNames
      const taxA = synteny.assemblyInfo[a!]?.taxonId
      const taxB = synteny.assemblyInfo[b!]?.taxonId
      if (taxA !== undefined && taxB !== undefined && taxA !== taxB) {
        wanted.add(pairKey(taxA, taxB))
        withTaxa++
      }
    }
  }
  console.log(
    `${wanted.size} distinct taxon pairs from ${withTaxa} synteny tracks with known taxa`,
  )
  return wanted
}

interface Edge {
  key: string
  loTax: number
  loGene: number
  hiGene: number
}

// Pass over gene_orthologs.gz collecting only Ortholog edges whose unordered
// taxon pair is wanted. Records the GeneIDs needed for symbol resolution.
async function loadEdges(wanted: Set<string>) {
  const edges: Edge[] = []
  const neededGenes = new Set<number>()
  let scanned = 0
  for await (const line of gzipLines(
    join(ORTHOLOG_DATA_DIR, 'gene_orthologs.gz'),
  )) {
    if (!line.startsWith('#')) {
      scanned++
      const [taxId, geneId, relationship, otherTax, otherGene] = line.split('\t')
      if (relationship === 'Ortholog') {
        const t1 = +taxId!
        const t2 = +otherTax!
        const key = pairKey(t1, t2)
        if (t1 !== t2 && wanted.has(key)) {
          const g1 = +geneId!
          const g2 = +otherGene!
          const loTax = Math.min(t1, t2)
          const loGene = t1 === loTax ? g1 : g2
          const hiGene = t1 === loTax ? g2 : g1
          edges.push({ key, loTax, loGene, hiGene })
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

// Pass over gene_info.gz resolving GeneID -> Symbol for just the needed genes.
async function loadSymbols(neededGenes: Set<number>) {
  const symbols = new Map<number, string>()
  for await (const line of gzipLines(join(ORTHOLOG_DATA_DIR, 'gene_info.gz'))) {
    if (!line.startsWith('#')) {
      // cols: tax_id, GeneID, Symbol, ...
      const tab1 = line.indexOf('\t')
      const tab2 = line.indexOf('\t', tab1 + 1)
      const geneId = +line.slice(tab1 + 1, tab2)
      if (neededGenes.has(geneId)) {
        const tab3 = line.indexOf('\t', tab2 + 1)
        symbols.set(geneId, line.slice(tab2 + 1, tab3))
      }
    }
  }
  console.log(`resolved ${symbols.size} gene symbols`)
  return symbols
}

async function main() {
  const wanted = await loadWantedPairs()
  if (wanted.size === 0) {
    console.log('No taxon pairs with synteny tracks; nothing to build.')
    return
  }

  const { edges, neededGenes } = await loadEdges(wanted)
  const symbols = await loadSymbols(neededGenes)

  // Group resolved symbol pairs per taxon-pair file, de-duplicating identical
  // symbolA/symbolB rows that arise from the bidirectional ortholog records.
  const perPair = new Map<string, Set<string>>()
  for (const edge of edges) {
    const loSym = symbols.get(edge.loGene)
    const hiSym = symbols.get(edge.hiGene)
    if (loSym && hiSym) {
      const existing = perPair.get(edge.key)
      const set = existing ?? new Set<string>()
      set.add(`${loSym}\t${hiSym}`)
      if (!existing) {
        perPair.set(edge.key, set)
      }
    }
  }

  await mkdir(OUTPUT_DIR, { recursive: true })
  const pairs: string[] = []
  for (const [key, rows] of perPair) {
    const sorted = [...rows].sort((a, b) => a.localeCompare(b))
    await writeFile(join(OUTPUT_DIR, `${key}.tsv`), `${sorted.join('\n')}\n`)
    pairs.push(key)
  }
  pairs.sort()

  await mkdir(dirname(MANIFEST), { recursive: true })
  await writeFile(
    MANIFEST,
    JSON.stringify({ generatedAt: new Date().toISOString(), pairs }, null, 2),
  )
  console.log(`Wrote ${pairs.length} pair files to ${OUTPUT_DIR}`)
  console.log(`Wrote manifest ${MANIFEST}`)
}

main().catch((e: unknown) => {
  console.error(e)
  process.exit(1)
})
