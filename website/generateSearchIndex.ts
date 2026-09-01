import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

import { ncbiStatusOf } from './src/lib/searchIndex.ts'

import type { IndexEntry } from './src/lib/searchIndex.ts'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const allHubsPath = path.join(__dirname, 'processedHubJson/all.json')
const listPath = path.join(__dirname, 'src/list.json')
const outputPath = path.join(__dirname, 'public/searchIndex.json')

interface HubRecord {
  accession: string | null
  commonName: string | null
  scientificName: string | null
  ncbiAssemblyName: string | null
  assemblyStatus: string | null
  source: string | null
  taxonId: number | null
  seqReleaseDate?: string | null
  ncbiRefSeqCategory?: string | null
  suppressed?: boolean | null
}

interface UcscGenome {
  organism: string | null
  scientificName: string | null
  description: string | null
  sourceName?: string | null
  orderKey?: number | null
  id: string | null
  taxId: number | null
}

const allHubs: HubRecord[] = JSON.parse(fs.readFileSync(allHubsPath, 'utf-8'))
const list = JSON.parse(fs.readFileSync(listPath, 'utf-8'))
const ucscGenomes = list.ucscGenomes as Record<string, UcscGenome>

// Assemblies are overwhelmingly disambiguated by their year — a query for "mouse"
// must not rank mm7 (2005) alongside mm39 (2020) — so every row carries one.
function yearOf(text: string | null | undefined) {
  const match = /\b(?:19|20)\d{2}\b/.exec(text ?? '')
  return match ? Number(match[0]) : 0
}

// UCSC packs "<date> (<assembly>/<db>)" into `description`, e.g.
// "Dec. 2013 (GRCh38/hg38)". The assembly name is the last parenthetical up to
// its final slash, which also covers the dateless viral entries
// ("MPXV-… (MT903340.1/GCF_014621545.1)" -> MT903340.1).
function ucscAssemblyName(description: string | null | undefined) {
  // The trailing [^(]* anchors this to the *last* parenthetical.
  const inner = /\(([^)]*)\)[^(]*$/.exec(description ?? '')?.[1] ?? ''
  const slash = inner.lastIndexOf('/')
  return slash > 0 ? inner.slice(0, slash) : inner
}

// UCSC's own `orderKey` ranks every db it serves in one global list, so it is
// only meaningful within a species. Densify it per organism into 1 = the db UCSC
// puts first (hs1 for human, mm39 for mouse), which is what the search needs as
// a last-resort tiebreak between same-year dbs. 0 means "unranked" (GenArk).
function buildUcscRanks() {
  const byOrganism = new Map<string, { db: string; orderKey: number }[]>()
  for (const [db, genome] of Object.entries(ucscGenomes)) {
    const organism = genome.organism ?? db
    const group = byOrganism.get(organism) ?? []
    group.push({ db, orderKey: genome.orderKey ?? Number.MAX_SAFE_INTEGER })
    byOrganism.set(organism, group)
  }
  const ranks = new Map<string, number>()
  for (const group of byOrganism.values()) {
    group.sort((a, b) => a.orderKey - b.orderKey)
    group.forEach(({ db }, i) => ranks.set(db, i + 1))
  }
  return ranks
}

const ucscRanks = buildUcscRanks()

// Array of arrays to avoid repeating key names 50K times; the fields are
// documented on IndexEntry (src/lib/searchIndex.ts).
const index: IndexEntry[] = allHubs
  .filter(h => h.accession)
  .map(h => [
    h.accession ?? '',
    h.commonName ?? '',
    h.scientificName ?? '',
    h.ncbiAssemblyName ?? '',
    h.assemblyStatus ?? '',
    h.source ?? '',
    h.taxonId ?? 0,
    ncbiStatusOf(h),
    // GenArk rows carry an ISO release date; commonName repeats the year in a
    // parenthetical ("aardvark (SDZICR_OR568_19922 2012 Broad)") for the few
    // that don't.
    yearOf(h.seqReleaseDate) || yearOf(h.commonName),
    0,
    '',
  ])

// Add UCSC genomes (hg38, mm39, etc.)
for (const [id, genome] of Object.entries(ucscGenomes)) {
  index.push([
    id,
    genome.organism ?? '',
    genome.scientificName ?? '',
    ucscAssemblyName(genome.description),
    '',
    'ucsc',
    genome.taxId ?? 0,
    0,
    yearOf(genome.description),
    ucscRanks.get(id) ?? 0,
    // altAccession: the GC[AF] accession the sourceName records, so the db is
    // reachable by accession search
    /GC[AF]_\d+(?:\.\d+)?/.exec(genome.sourceName ?? '')?.[0] ?? '',
  ])
}

fs.mkdirSync(path.dirname(outputPath), { recursive: true })
fs.writeFileSync(outputPath, JSON.stringify(index))

const sizeKB = (fs.statSync(outputPath).size / 1024).toFixed(0)
console.log(
  `Search index: ${index.length} entries (${allHubs.length} genark + ${Object.keys(ucscGenomes).length} ucsc), ${sizeKB} KB`,
)
