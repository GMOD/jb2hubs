// A gene the region box names, placed through the reference's own trix search
// index, which `jbrowse text-index` writes beside every hosted config. Its
// records come from the reference's gene tracks on the reference's own build,
// with NCBI's synonyms, so a graph on any hosted assembly needs no gene source
// of its own. On 2026-11-02 every coding gene of hg38, mm39, bosTau9 and
// TAIR10.1 came back on its GFF span.

import Trix from '@gmod/trix'

import { GENE_FLANK_BP, placeRegion } from './pangenomeRegion.ts'
import { PageFile } from './pangenomeTabix.ts'

import type { GeneRegion, GraphSequence } from './pangenomeRegion.ts'

interface IndexedFeature {
  name: string
  id: string
  aliases: string[]
  chrom: string
  start: number
  end: number
}

type Search = (term: string) => Promise<readonly (readonly [string, string])[]>

// A transcript's record carries its gene's synonyms under its own accession.
const TRANSCRIPT = /^[NX][MR]_/

// `["chr6:31982057..32002681"|"trackId"|"name"|"id"|"synonyms"]`, each field
// URI-encoded and the span 1-based.
export function parseRecord(record: string): IndexedFeature | undefined {
  const parsed: unknown = JSON.parse(record.replaceAll('|', ','))
  const [loc = '', , name = '', id = '', aliases = ''] = Array.isArray(parsed)
    ? parsed.map(field => decodeURIComponent(String(field)))
    : []
  const span = /^(.+):(\d+)\.\.(\d+)$/.exec(loc)
  return span
    ? {
        name,
        id,
        aliases: aliases.split(' '),
        chrom: span[1]!,
        start: Number(span[2]) - 1,
        end: Number(span[3]),
      }
    : undefined
}

async function records(search: Search, term: string) {
  return (await search(term)).flatMap(([, record]) => {
    const feature = parseRecord(record)
    return feature ? [feature] : []
  })
}

// The gene the text names, by symbol, else by an NCBI synonym (HER2 is
// ERBB2's), else by NCBI's gene id: an Arabidopsis AGI code is indexed only as
// `gene-AT5G10140`. A record on a sequence the graph does not hold (an alt
// haplotype, or NCBI's NC_ name for a UCSC graph) is passed over.
export async function indexedGeneRegion(
  search: Search,
  text: string,
  sequences: readonly GraphSequence[],
): Promise<GeneRegion | undefined> {
  const wanted = text.toLowerCase()
  const placedWhere = (
    features: IndexedFeature[],
    named: (f: IndexedFeature) => boolean,
  ) =>
    features.flatMap(f => {
      const region = named(f) ? placeRegion(f, sequences) : undefined
      return region ? [region] : []
    })[0]
  const bySymbol = async (symbol: string) =>
    placedWhere(
      await records(search, symbol.toLowerCase()),
      f => f.name.toLowerCase() === symbol.toLowerCase(),
    )
  const found = await records(search, wanted)
  const synonymOf = found.find(
    f =>
      !TRANSCRIPT.test(f.name) &&
      f.aliases.some(alias => alias.toLowerCase() === wanted),
  )?.name
  const gene =
    placedWhere(found, f => f.name.toLowerCase() === wanted) ??
    (synonymOf ? await bySymbol(synonymOf) : undefined) ??
    placedWhere(
      await records(search, `gene-${wanted}`),
      f => f.id.toLowerCase() === `gene-${wanted}`,
    )
  return gene
    ? {
        chrom: gene.chrom,
        start: Math.max(0, gene.start - GENE_FLANK_BP),
        end: gene.end + GENE_FLANK_BP,
        symbol: gene.name,
        gene: { start: gene.start, end: gene.end },
      }
    : undefined
}

// Enough records that a short symbol's own come back past the many that share
// its first letters; a search reads one 64 KB block of the .ix either way.
const MAX_RECORDS = 200

// One reader per index for the life of the page, so its .ixx is read once.
const indexes = new Map<string, Trix>()

function geneIndex(url: string) {
  const known = indexes.get(url)
  const index =
    known ??
    new Trix(new PageFile(`${url}.ixx`), new PageFile(`${url}.ix`), MAX_RECORDS)
  indexes.set(url, index)
  return index
}

export function geneLookup(
  indexUrl: string,
  sequences: readonly GraphSequence[],
  signal?: AbortSignal,
) {
  return (text: string) =>
    indexedGeneRegion(
      term => geneIndex(indexUrl).search(term, { signal }),
      text,
      sequences,
    )
}
