import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

import {
  buildUcscMapping,
  loadAccessionMap,
} from './src/utils/accessionData.ts'

import type { IndexEntry } from './src/lib/searchIndex.ts'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const searchIndex: IndexEntry[] = JSON.parse(
  fs.readFileSync(path.join(__dirname, 'public/searchIndex.json'), 'utf-8'),
)

const outputPath = path.join(__dirname, 'public/ortholog_index.json')

// UCSC-native assemblies (human/hg38, mouse/mm39, …) get their browser db baked
// in so the client can launch the curated /ucsc/<db> config instead of the
// GenArk-sharded config, whose sequence data 404s for these genomes.
const ucscMapping = buildUcscMapping(loadAccessionMap())

// The file answers two questions and deliberately nothing else: do we host this
// accession, and does UCSC serve it natively. Species names used to live here
// too — 44,685 of them, 84% of the bytes — and every NCBI ortholog report
// already names its own row's species (`taxname`/`common_name`) in cleaner form,
// with no trailing assembly parenthetical to strip. See orthologDb.ts.
//
// Only GCF (RefSeq) assemblies appear in NCBI ortholog API responses.
interface UcscConfig {
  assemblies?: { name?: string }[]
  defaultSession?: { views?: { init?: { tracks?: string[] } }[] }
}

const ucscConfigs = path.join(__dirname, '../ucsc2jbrowse/configs')
const configCache = new Map<string, UcscConfig | undefined>()
function ucscConfig(db: string) {
  if (!configCache.has(db)) {
    const file = path.join(ucscConfigs, `${db}.json`)
    configCache.set(
      db,
      fs.existsSync(file)
        ? (JSON.parse(fs.readFileSync(file, 'utf-8')) as UcscConfig)
        : undefined,
    )
  }
  return configCache.get(db)
}

// A UCSC db built on the GenBank twin of a RefSeq assembly (calJac240_pri is
// GCA_049354715.1) names its sequences the GenBank way, so the RefSeq
// sequence names an NCBI ortholog row is placed on resolve nowhere in it, and
// every launch from such a row opened on nothing. Those rows keep their GenArk
// hub.
function opensRefSeqNames(db: string) {
  return !ucscConfig(db)?.assemblies?.[0]?.name?.startsWith('GCA_')
}

const accessions: string[] = []
const ucscDb: Record<string, string> = {}
for (const entry of searchIndex) {
  const accession = entry[0]
  if (accession.startsWith('GCF_')) {
    accessions.push(accession)
    const db = ucscMapping.get(accession)
    if (db && opensRefSeqNames(db)) {
      ucscDb[accession] = db
    }
  }
}

// The gene track each UCSC genome's own defaultSession opens. A launch that
// names a locus starts a session of its own, so it opens the config's
// defaultSession tracks only by naming them: without this every UCSC-native
// row of the ortholog table, human's included, opened on no tracks at all.
const geneTrack: Record<string, string> = {}
for (const db of new Set(Object.values(ucscDb))) {
  const track = ucscConfig(db)?.defaultSession?.views?.[0]?.init?.tracks?.[0]
  if (track) {
    geneTrack[db] = track
  }
}

// Sorted for the compressor, not for the reader: nothing downstream depends on
// the order (createStore builds a Set and picks the newest version explicitly),
// and neighbouring accessions then share long prefixes — 125 KB gzipped against
// 167 KB in searchIndex order, for the same 787 KB of JSON.
accessions.sort()

fs.writeFileSync(
  outputPath,
  JSON.stringify({ schema: 'ortholog-index/2', accessions, ucscDb, geneTrack }),
)

const sizeKB = (fs.statSync(outputPath).size / 1024).toFixed(0)
console.log(
  `Ortholog index: ${accessions.length} GCF assemblies ` +
    `(${Object.keys(ucscDb).length} UCSC-native, ${Object.keys(geneTrack).length} with a gene track), ${sizeKB} KB`,
)
