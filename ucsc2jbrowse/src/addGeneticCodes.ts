import fs from 'fs'

import {
  localChromSizesPath,
  readMitoCache,
  writeMitoCache,
} from './mitoCodes.ts'

import type { MitoCache } from './mitoCodes.ts'
import type { FinalizeStep } from './utils/finalizeStep.ts'

// The standard nuclear genetic code. Animals (all UCSC main-browser genomes)
// use code 1 in the nucleus but a non-standard mitochondrial code (vertebrate
// = 2, invertebrate = 5, etc.) on their chrM contig. Mirrors the GenArk
// genetic-code derivation, which mines transl_table from NCBI GFFs; here the
// source GFFs are genePred-derived and carry no transl_table, so we instead
// look up the mitochondrial code by taxId from NCBI taxonomy and key it by the
// canonical UCSC mito refName (chrM).
const STANDARD_CODE = 1

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

/**
 * The taxId -> mitochondrial code cache, with every taxon in `taxIds` the cache
 * does not yet answer for fetched from NCBI in one round. The cache's shape,
 * TTL and reason for existing are in mitoCodes.ts.
 */
export async function prefetchMitoCodes(
  cachePath: string,
  taxIds: number[],
): Promise<MitoCache> {
  const cache = readMitoCache(cachePath)
  const wanted = [...new Set(taxIds)]
  const uncached = wanted.filter(taxId => !(String(taxId) in cache.codes))
  if (uncached.length > 0) {
    const { codes, answered } = await fetchMitoCodes(uncached)
    for (const taxId of answered) {
      cache.codes[String(taxId)] = codes.get(taxId) ?? null
    }
    writeMitoCache(cachePath, cache)
  }
  console.warn(
    `genetic codes: ${uncached.length} of ${wanted.length} taxa queried from NCBI`,
  )
  return cache
}

function mitoContigsFromChromSizes(text: string) {
  return text.split('\n').flatMap(line => {
    const name = line.split('\t')[0]
    return name !== undefined && /^chrM(T)?$/.test(name) ? [name] : []
  })
}

// The mito contig names actually present in the assembly (chrM/chrMT), read
// from its chrom.sizes. `undefined` means chrom.sizes was unavailable, which
// the caller treats as "assume the conventional chrM" rather than "no mito".
// The sidecar mirrored beside the config on a previous run is read first, so
// a steady-state build fetches nothing; `fetched` is counted so a silent
// regression to fetching does not look identical.
async function fetchMitoContigs(
  chromSizes: string,
  dir: string,
  assemblyName: string,
) {
  const local = localChromSizesPath(chromSizes, dir, assemblyName)
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

export const addGeneticCodes: FinalizeStep = {
  name: 'genetic codes',
  run: async ({ dir, config, mitoCache }) => {
    const counts: Record<string, number> = {}
    const assembly = config.assemblies[0]
    const sequence = assembly?.sequence
    const taxId = sequence?.metadata?.taxId
    const chromSizes = sequence?.adapter.chromSizes
    if (assembly === undefined || typeof taxId !== 'number') {
      return counts
    }
    const code = mitoCache.codes[String(taxId)]
    if (code === undefined || code === null || code === STANDARD_CODE) {
      return counts
    }
    const { contigs: present, fetched } =
      typeof chromSizes === 'string'
        ? await fetchMitoContigs(chromSizes, dir, assembly.name)
        : { contigs: undefined, fetched: false }
    if (fetched) {
      counts['chrom.sizes fetched remotely'] = 1
    }
    // undefined = chrom.sizes unavailable, fall back to the UCSC convention;
    // [] = assembly genuinely has no mito contig, so emit nothing.
    const contigs = present ?? ['chrM']
    if (contigs.length > 0) {
      assembly.geneticCodes = Object.fromEntries(contigs.map(c => [c, code]))
      counts.set = 1
    }
    return counts
  },
}
