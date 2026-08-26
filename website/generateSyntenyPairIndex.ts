import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const inputPath = path.join(__dirname, 'src/syntenyTracks.json')
const orthologIndexPath = path.join(__dirname, 'public/ortholog_index.json')
const outputPath = path.join(__dirname, 'public/synteny_pairs.json')

interface Track {
  trackId: string
  assemblyNames: string[]
}

interface SyntenyData {
  tracks: Track[]
}

const data: SyntenyData = JSON.parse(fs.readFileSync(inputPath, 'utf-8'))

// The ortholog index, written by generateOrthologIndex.ts just before this
// script in `pnpm generate`. Reading it rather than rebuilding the mapping is
// what keeps the two files agreeing: a synteny pair is only ever useful if both
// of its assemblies are rows the ortholog table can show.
// Entry: [commonName, scientificName, taxonId, ucscDb?].
type IndexEntry = [string, string, number] | [string, string, number, string]
const orthologIndex: Record<string, IndexEntry> = JSON.parse(
  fs.readFileSync(orthologIndexPath, 'utf-8'),
)

// The names a synteny track uses for its two genomes are whatever the hosted
// config calls them, and for a UCSC-native assembly that is the browser db —
// `hg38`, not GCF_000001405.40. Requiring both halves to look like a GCF
// accession therefore threw away every human, mouse and dog comparison we
// host: 586 of the 3,094 tracks name hg38, and none of them survived. So
// resolve a name to its accession here, and carry the original name through to
// the client, which needs it to merge the right hub and label the right panel.
const ucscToAccession = new Map<string, string>()
const byBase = new Map<string, string>()
const version = (accession: string) => Number(/\.(\d+)$/.exec(accession)?.[1])
for (const [accession, entry] of Object.entries(orthologIndex)) {
  const ucscDb = entry[3]
  if (ucscDb) {
    ucscToAccession.set(ucscDb, accession)
  }
  const base = accession.replace(/\.\d+$/, '')
  const existing = byBase.get(base)
  if (!existing || version(accession) > version(existing)) {
    byBase.set(base, accession)
  }
}

// A track's assembly name -> the hosted RefSeq accession it stands for, or
// undefined when the ortholog table could never show that assembly anyway.
function toAccession(name: string) {
  return (
    ucscToAccession.get(name) ??
    (orthologIndex[name] ? name : byBase.get(name.replace(/\.\d+$/, '')))
  )
}

// "<accession1>,<accession2>" -> [trackId, name1, name2], the names in the same
// order as the key. Storing the key in assemblyNames order lets the consumer
// choose which assembly is the synteny "target" by controlling the lookup order.
//
// Both liftOver directions of a comparison are kept, as two keys. What is
// dropped is a track whose halves are the same genome under two names — UCSC
// dm6 against the GenArk build of the same assembly, or two versions of
// Arabidopsis. The client matches on the version-stripped base, so those would
// answer a "is A syntenic with A" lookup and offer a row a synteny link to
// itself.
const pairs: Record<string, [string, string, string]> = {}
const base = (accession: string) => accession.replace(/\.\d+$/, '')
let viaUcscDb = 0
let selfPairs = 0
let collisions = 0
for (const track of data.tracks) {
  const [name1, name2] = track.assemblyNames
  const acc1 = name1 ? toAccession(name1) : undefined
  const acc2 = name2 ? toAccession(name2) : undefined
  if (name1 && name2 && acc1 && acc2) {
    if (base(acc1) === base(acc2)) {
      selfPairs += 1
    } else {
      const key = `${acc1},${acc2}`
      if (pairs[key]) {
        collisions += 1
      }
      pairs[key] = [track.trackId, name1, name2]
      if (acc1 !== name1 || acc2 !== name2) {
        viaUcscDb += 1
      }
    }
  }
}

fs.mkdirSync(path.dirname(outputPath), { recursive: true })
fs.writeFileSync(outputPath, JSON.stringify(pairs))

const sizeKB = (fs.statSync(outputPath).size / 1024).toFixed(0)
console.log(
  `Synteny pair index: ${Object.keys(pairs).length} tracks ` +
    `(${viaUcscDb} named by UCSC db rather than accession), ${sizeKB} KB; ` +
    `skipped ${selfPairs} same-genome pairs, ${collisions} duplicate keys`,
)
