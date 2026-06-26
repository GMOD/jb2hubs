/* eslint-disable no-console */
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

// Fetches each taxon's mitochondrial genetic code from NCBI taxonomy. The
// efetch XML embeds every taxon's full lineage, whose nested <Taxon> nodes
// carry their own <TaxId> but never an <MGCId>. Each top-level record lists its
// own <TaxId> before its single <MGCId>, with lineage TaxIds appearing only
// afterward, so the taxon owning an <MGCId> is the last <TaxId> seen before it.
async function fetchMitoCodes(taxIds: number[]): Promise<Map<number, number>> {
  const result = new Map<number, number>()
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
          result.set(lastTaxId, Number(m[2]))
        }
      }
    } else {
      console.warn(
        `efetch failed for taxa chunk starting at index ${i}: ${res.status}`,
      )
    }
  }
  return result
}

// Returns the mito contig names actually present in the assembly (chrM/chrMT),
// read from its chrom.sizes. undefined means chrom.sizes was unavailable, which
// the caller treats as "assume the conventional chrM" rather than "no mito".
async function fetchMitoContigs(
  chromSizesUrl: string,
): Promise<string[] | undefined> {
  const res = await fetch(chromSizesUrl)
  return res.ok
    ? (await res.text()).split('\n').flatMap(line => {
        const name = line.split('\t')[0]
        return name !== undefined && /^chrM(T)?$/.test(name) ? [name] : []
      })
    : undefined
}

async function mapWithConcurrency<T, U>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<U>,
): Promise<U[]> {
  const results = new Array<U>(items.length)
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
  taxId: number
  chromSizesUrl?: string
}

const configPaths = process.argv.slice(2)

const entries = configPaths.flatMap<Entry>(configPath => {
  const config = readConfig(configPath)
  const sequence = config.assemblies[0]?.sequence
  const taxId = sequence?.metadata?.taxId
  const chromSizes = sequence?.adapter.chromSizes
  return typeof taxId === 'number'
    ? [
        {
          configPath,
          config,
          taxId,
          chromSizesUrl:
            typeof chromSizes === 'string' ? chromSizes : undefined,
        },
      ]
    : []
})

const mitoCodes = await fetchMitoCodes([...new Set(entries.map(e => e.taxId))])

await mapWithConcurrency(entries, 8, async entry => {
  const code = mitoCodes.get(entry.taxId)
  if (code !== undefined && code !== STANDARD_CODE) {
    const present = entry.chromSizesUrl
      ? await fetchMitoContigs(entry.chromSizesUrl)
      : undefined
    // undefined = chrom.sizes unavailable, fall back to the UCSC convention;
    // [] = assembly genuinely has no mito contig, so emit nothing.
    const contigs = present ?? ['chrM']
    if (contigs.length > 0) {
      const assembly = entry.config.assemblies[0]!
      assembly.geneticCodes = Object.fromEntries(contigs.map(c => [c, code]))
      writeJSON(entry.configPath, entry.config)
      console.log(
        `${assembly.name}: geneticCodes ${contigs.join(',')} = ${code}`,
      )
    }
  }
})

export {}
