#!/usr/bin/env node
/* eslint-disable no-console */
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'

import { ncbiSource } from './sources/ncbi.ts'

import type { Contribution, OrthologSource, Wanted } from './sources/types.ts'

// Builds the gene comparison tables that drive synteny gene search, scoped to
// assembly pairs that already have a synteny track. The work splits cleanly in
// three:
//
//   1. loadWanted   - which taxon pairs / taxa to cover (from syntenyTracks)
//   2. sources      - each yields a normalized Contribution (symbol pairs +
//                     per-taxon genes); merged together
//   3. emit         - writes the source-agnostic output the website reads
//
// Adding another source (e.g. OrthoDB) is just another entry in SOURCES that
// returns a Contribution; emit and the runtime adapter are untouched.
//
// Output:
//   <loTax>_<hiTax>.tsv  cross-species ortholog edges, `loSym<TAB>hiSym`
//   <tax>.tsv            same-species genes, `symbol<TAB>synonym1|synonym2|...`

const SOURCES: OrthologSource[] = [ncbiSource]

const SYNTENY_TRACKS = 'website/src/syntenyTracks.json'
const OUTPUT_DIR = 'website/public/orthologs'
const MANIFEST = 'website/src/orthologManifest.json'

interface SyntenyInput {
  tracks: { assemblyNames: string[] }[]
  assemblyInfo: Record<string, { taxonId?: number }>
}

function pairKey(a: number, b: number) {
  return `${Math.min(a, b)}_${Math.max(a, b)}`
}

// From the synteny tracks: cross-species taxon pairs (taxA != taxB) and
// same-species taxa (taxA == taxB), each derived from assembly pairs mapped
// through their taxonId.
async function loadWanted(): Promise<Wanted> {
  const synteny: SyntenyInput = JSON.parse(
    await readFile(SYNTENY_TRACKS, 'utf8'),
  )
  const pairs = new Set<string>()
  const sameTaxa = new Set<number>()
  for (const track of synteny.tracks) {
    if (track.assemblyNames.length === 2) {
      const [a, b] = track.assemblyNames
      const taxA = synteny.assemblyInfo[a!]?.taxonId
      const taxB = synteny.assemblyInfo[b!]?.taxonId
      if (taxA !== undefined && taxB !== undefined) {
        if (taxA === taxB) {
          sameTaxa.add(taxA)
        } else {
          pairs.add(pairKey(taxA, taxB))
        }
      }
    }
  }
  console.log(
    `${pairs.size} cross-species pairs, ${sameTaxa.size} same-species taxa`,
  )
  return { pairs, sameTaxa }
}

// Fold one source's contribution into the running total: union the symbol-pair
// rows, and union synonym tokens per same-species gene.
function merge(into: Contribution, from: Contribution) {
  for (const [key, rows] of from.pairRows) {
    const target = into.pairRows.get(key) ?? new Set<string>()
    for (const row of rows) {
      target.add(row)
    }
    into.pairRows.set(key, target)
  }
  for (const [tax, genes] of from.taxonGenes) {
    const target = into.taxonGenes.get(tax) ?? new Map<string, string>()
    for (const [symbol, synonyms] of genes) {
      const merged = new Set(
        [target.get(symbol), synonyms]
          .filter(Boolean)
          .flatMap(s => s!.split('|')),
      )
      target.set(symbol, [...merged].join('|'))
    }
    into.taxonGenes.set(tax, target)
  }
}

async function emit(total: Contribution) {
  await mkdir(OUTPUT_DIR, { recursive: true })

  const pairs: string[] = []
  for (const [key, rows] of total.pairRows) {
    if (rows.size > 0) {
      const sorted = [...rows].sort((a, b) => a.localeCompare(b))
      await writeFile(join(OUTPUT_DIR, `${key}.tsv`), `${sorted.join('\n')}\n`)
      pairs.push(key)
    }
  }
  pairs.sort()

  const taxa: number[] = []
  for (const [tax, genes] of total.taxonGenes) {
    if (genes.size > 0) {
      const lines = [...genes]
        .map(([symbol, synonyms]) => `${symbol}\t${synonyms}`)
        .sort((a, b) => a.localeCompare(b))
      await writeFile(join(OUTPUT_DIR, `${tax}.tsv`), `${lines.join('\n')}\n`)
      taxa.push(tax)
    }
  }
  taxa.sort((a, b) => a - b)

  await mkdir(dirname(MANIFEST), { recursive: true })
  await writeFile(
    MANIFEST,
    JSON.stringify(
      { generatedAt: new Date().toISOString(), pairs, taxa },
      null,
      2,
    ),
  )
  console.log(
    `Wrote ${pairs.length} pair + ${taxa.length} taxon files to ${OUTPUT_DIR}`,
  )
}

async function main() {
  const wanted = await loadWanted()
  if (wanted.pairs.size === 0 && wanted.sameTaxa.size === 0) {
    console.log('No synteny taxon pairs/taxa; nothing to build.')
    return
  }

  const total: Contribution = {
    pairRows: new Map(),
    taxonGenes: new Map(),
  }
  for (const source of SOURCES) {
    console.log(`Gathering from source: ${source.name}`)
    merge(total, await source.gather(wanted))
  }

  await emit(total)
}

main().catch((e: unknown) => {
  console.error(e)
  process.exit(1)
})
