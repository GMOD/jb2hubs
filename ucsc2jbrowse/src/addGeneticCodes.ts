import fs from 'fs'
import path from 'path'

import {
  localChromSizesPath,
  readMitoCache,
  writeMitoCache,
} from './mitoCodes.ts'
import { readConfig, writeJSON } from './util.ts'

import type { JBrowseConfig } from './types.ts'

// The standard nuclear genetic code. Animals (all UCSC main-browser genomes)
// use code 1 in the nucleus but a non-standard mitochondrial code (vertebrate
// = 2, invertebrate = 5, etc.) on their chrM contig. Mirrors the GenArk
// add_genetic_codes step, which mines transl_table from NCBI GFFs; here the
// source GFFs are genePred-derived and carry no transl_table, so we instead
// look up the mitochondrial code by taxId from NCBI taxonomy and key it by the
// canonical UCSC mito refName (chrM).
const STANDARD_CODE = 1

// Where the taxId -> mitochondrial code answers are kept between runs, beside
// checkTrackUrls.mjs's rotation state and gitignored for the same reasons. The
// cache's shape, its TTL and the reason any of it exists are in mitoCodes.ts.
const CACHE_PATH = path.join(import.meta.dirname, '..', '.mitoCodes.json')

// Fetches each taxon's mitochondrial genetic code from NCBI taxonomy. The
// efetch XML embeds every taxon's full lineage, whose nested <Taxon> nodes
// carry their own <TaxId> but never an <MGCId>. Each top-level record lists its
// own <TaxId> before its single <MGCId>, with lineage TaxIds appearing only
// afterward, so the taxon owning an <MGCId> is the last <TaxId> seen before it.
//
// `answered` is the taxIds covered by a chunk NCBI actually served, which is
// what separates "this taxon has no MGCId" from "that request failed". Only the
// first may be cached as a negative; caching a failed request as an answer
// would suppress the genetic code for that assembly until the TTL expired.
async function fetchMitoCodes(taxIds: number[]) {
  const codes = new Map<number, number>()
  const answered = new Set<number>()
  const chunkSize = 200
  for (let i = 0; i < taxIds.length; i += chunkSize) {
    const chunk = taxIds.slice(i, i + chunkSize)
    const res = await fetch(
      'https://eutils.ncbi.nlm.nih.gov/entrez/eutils/efetch.fcgi',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          db: 'taxonomy',
          retmode: 'xml',
          id: chunk.join(','),
        }),
      },
    )
    if (res.ok) {
      const xml = await res.text()
      let lastTaxId: number | undefined
      for (const m of xml.matchAll(
        /<TaxId>(\d+)<\/TaxId>|<MGCId>(\d+)<\/MGCId>/g,
      )) {
        if (m[1] !== undefined) {
          lastTaxId = Number(m[1])
        } else if (m[2] !== undefined && lastTaxId !== undefined) {
          codes.set(lastTaxId, Number(m[2]))
        }
      }
      for (const taxId of chunk) {
        answered.add(taxId)
      }
    } else {
      console.warn(
        `efetch failed for taxa chunk starting at index ${i}: ${res.status}`,
      )
    }
  }
  return { codes, answered }
}

function mitoContigsFromChromSizes(text: string) {
  return text.split('\n').flatMap(line => {
    const name = line.split('\t')[0]
    return name !== undefined && /^chrM(T)?$/.test(name) ? [name] : []
  })
}

// Returns the mito contig names actually present in the assembly (chrM/chrMT),
// read from its chrom.sizes. `contigs: undefined` means chrom.sizes was
// unavailable, which the caller treats as "assume the conventional chrM" rather
// than "no mito". `fetched` is reported so the run summary can show that the
// local paths are doing their job -- a silent regression to fetching would
// otherwise look identical.
async function fetchMitoContigs(
  chromSizes: string,
  configPath: string,
  assemblyName: string,
) {
  const local = localChromSizesPath(
    chromSizes,
    path.dirname(configPath),
    assemblyName,
  )
  if (local !== undefined) {
    return {
      contigs: mitoContigsFromChromSizes(fs.readFileSync(local, 'utf8')),
      fetched: false,
    }
  }
  if (!/^https?:\/\//.test(chromSizes)) {
    return { contigs: undefined, fetched: false }
  }
  const res = await fetch(chromSizes)
  return {
    contigs: res.ok ? mitoContigsFromChromSizes(await res.text()) : undefined,
    fetched: true,
  }
}

async function mapWithConcurrency<T, U>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<U>,
) {
  const results: U[] = Array.from({ length: items.length })
  let next = 0
  async function worker() {
    while (next < items.length) {
      const current = next++
      results[current] = await fn(items[current]!)
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, () => worker()),
  )
  return results
}

interface Entry {
  configPath: string
  config: JBrowseConfig
  assemblyName: string
  taxId: number
  chromSizes?: string
}

const configPaths = process.argv.slice(2)

const entries = configPaths.flatMap<Entry>(configPath => {
  const config = readConfig(configPath)
  const assembly = config.assemblies[0]
  const sequence = assembly?.sequence
  const taxId = sequence?.metadata?.taxId
  const chromSizes = sequence?.adapter.chromSizes
  return typeof taxId === 'number' && assembly !== undefined
    ? [
        {
          configPath,
          config,
          assemblyName: assembly.name,
          taxId,
          chromSizes: typeof chromSizes === 'string' ? chromSizes : undefined,
        },
      ]
    : []
})

const cache = readMitoCache(CACHE_PATH)
const wanted = [...new Set(entries.map(e => e.taxId))]
const uncached = wanted.filter(taxId => !(String(taxId) in cache.codes))

if (uncached.length > 0) {
  const { codes, answered } = await fetchMitoCodes(uncached)
  for (const taxId of answered) {
    cache.codes[String(taxId)] = codes.get(taxId) ?? null
  }
  writeMitoCache(CACHE_PATH, cache)
}

let written = 0
let unchanged = 0
let fetches = 0

await mapWithConcurrency(entries, 8, async entry => {
  const code = cache.codes[String(entry.taxId)]
  if (code !== undefined && code !== null && code !== STANDARD_CODE) {
    const { contigs: present, fetched } = entry.chromSizes
      ? await fetchMitoContigs(
          entry.chromSizes,
          entry.configPath,
          entry.assemblyName,
        )
      : { contigs: undefined, fetched: false }
    if (fetched) {
      fetches++
    }
    // undefined = chrom.sizes unavailable, fall back to the UCSC convention;
    // [] = assembly genuinely has no mito contig, so emit nothing.
    const contigs = present ?? ['chrM']
    if (contigs.length > 0) {
      const assembly = entry.config.assemblies[0]!
      const geneticCodes = Object.fromEntries(contigs.map(c => [c, code]))
      // Only write when the answer moved. A reprocessed assembly always needs
      // the write (createAssemblies.sh dropped the key), but hub assemblies go
      // through Phase 4 on every run whether or not anything about them changed.
      if (
        JSON.stringify(assembly.geneticCodes) !== JSON.stringify(geneticCodes)
      ) {
        assembly.geneticCodes = geneticCodes
        writeJSON(entry.configPath, entry.config)
        written++
        console.log(
          `${assembly.name}: geneticCodes ${contigs.join(',')} = ${code}`,
        )
      } else {
        unchanged++
      }
    }
  }
})

console.log(
  `genetic codes: ${written} config(s) updated, ${unchanged} already current; ` +
    `${uncached.length} of ${wanted.length} taxa queried from NCBI, ` +
    `${fetches} chrom.sizes fetched remotely`,
)
