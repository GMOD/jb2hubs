import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

import type { SyntenyCatalogData } from './src/lib/syntenyCatalog.ts'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const inputPath = path.join(__dirname, 'src/syntenyTracks.json')
const orthologIndexPath = path.join(__dirname, 'public/ortholog_index.json')
const outputPath = path.join(__dirname, 'public/synteny_pairs.json')

const data: SyntenyCatalogData = JSON.parse(fs.readFileSync(inputPath, 'utf-8'))

// The ortholog index, written by generateOrthologIndex.ts just before this
// script in `pnpm generate`. Reading it rather than rebuilding the mapping is
// what keeps the two files agreeing: a synteny pair is only ever useful if both
// of its assemblies are rows the ortholog table can show.
interface OrthologIndex {
  schema: string
  accessions: string[]
  ucscDb: Record<string, string>
}
if (!fs.existsSync(orthologIndexPath)) {
  // Left silent, this would emit a plausible-looking file with every UCSC-named
  // track dropped — the exact bug this script was fixed for.
  throw new Error(
    `${orthologIndexPath} is missing; run \`pnpm generate-ortholog-index\` first (\`pnpm generate\` does both, in order)`,
  )
}
const orthologIndex: OrthologIndex = JSON.parse(
  fs.readFileSync(orthologIndexPath, 'utf-8'),
)
const hosted = new Set(orthologIndex.accessions)

// The names a synteny track uses for its two genomes are whatever the hosted
// config calls them, and for a UCSC-native assembly that is the browser db —
// `hg38`, not GCF_000001405.40. Requiring both halves to look like a GCF
// accession therefore threw away every human, mouse and dog comparison we
// host: 586 of the 3,094 tracks name hg38, and none of them survived. So
// resolve a name to its accession here, and carry the original name through to
// the client, which needs it to merge the right hub and label the right panel.
//
// Several accessions can map to one db (anoCar2 is GCF_000090745.1 and .2), so
// each db and each accession base resolves to its newest hosted version rather
// than to whichever the index happened to list last.
const base = (accession: string) => accession.replace(/\.\d+$/, '')
const version = (accession: string) => Number(/\.(\d+)$/.exec(accession)?.[1])
function keepNewest(map: Map<string, string>, key: string, accession: string) {
  const existing = map.get(key)
  if (!existing || version(accession) > version(existing)) {
    map.set(key, accession)
  }
}
const ucscToAccession = new Map<string, string>()
const byBase = new Map<string, string>()
for (const [accession, ucscDb] of Object.entries(orthologIndex.ucscDb)) {
  keepNewest(ucscToAccession, ucscDb, accession)
}
for (const accession of orthologIndex.accessions) {
  keepNewest(byBase, base(accession), accession)
}

// A track's assembly name -> the hosted RefSeq accession it stands for, or
// undefined when the ortholog table could never show that assembly anyway.
//
// A UCSC db stands for its accession only while that is the newest hosted
// version of its base, because the client matches on the base and the ortholog
// store resolves a base to its newest version. mm10 is GCF_000001635.26, and
// indexing its tracks would answer a lookup of mouse, which means GRCm39's .27,
// with a panel of GRCm38 coordinates.
function toAccession(name: string) {
  const ucscAccession = ucscToAccession.get(name)
  if (ucscAccession) {
    return byBase.get(base(ucscAccession)) === ucscAccession
      ? ucscAccession
      : undefined
  }
  return hosted.has(name) ? name : byBase.get(base(name))
}

// The gene track a launched panel opens for one genome, under whichever name
// that genome's synteny track calls it. A LinearSyntenyView sub-view gets no
// defaultSession, so a panel with no explicit track is an empty browser — which
// is what every synteny launch used to be: right locus, nothing drawn. The
// catalog resolves it once per assembly (see geneTrackFor in
// scripts/extractSyntenyTracks.ts: the NCBI GFF3 on a UCSC config, the
// ncbiRefSeq bigBed or a gene prediction on a GenArk hub), and '' means its
// config has none.
function geneTrackFor(name: string) {
  return data.assemblyInfo[name]?.geneTrack ?? ''
}

// "<accession1>,<accession2>" -> [trackId, name1, name2, geneTrack1,
// geneTrack2], the names in the same order as the key. Storing the key in
// assemblyNames order lets the consumer choose which assembly is the synteny
// "target" by controlling the lookup order. A gene track we could not resolve is
// written as an empty string, which the client reads as "open this panel with no
// track" rather than as a trackId.
//
// Both liftOver directions of a comparison are kept, as two keys. What is
// dropped is a track whose halves are the same genome under two names — UCSC
// dm6 against the GenArk build of the same assembly, or two versions of
// Arabidopsis. The client matches on the version-stripped base, so those would
// answer a "is A syntenic with A" lookup and offer a row a synteny link to
// itself. The /synteny catalog's own isSelfPair keeps the version — hg19 and
// hg38 share GCA_000001405 and are a real comparison there — which this file
// cannot, because its keys are base-matched.
//
// For the same reason, two tracks whose keys differ only in version — a GenArk
// hub's .1 and .2 against hg38 — are one lookup on the client. The index keeps
// the track whose halves are the versions the ortholog store resolves their
// bases to, the newest hosted, not whichever came last in the catalog.
type PairEntry = [string, string, string, string, string]
const pairs = new Map<string, { key: string; entry: PairEntry }>()
const newestHalves = (key: string) =>
  key.split(',').filter(a => byBase.get(base(a)) === a).length
let selfPairs = 0
let superseded = 0
const noGeneTrack = new Set<string>()
for (const track of data.tracks) {
  const [name1, name2] = track.assemblyNames
  const acc1 = name1 ? toAccession(name1) : undefined
  const acc2 = name2 ? toAccession(name2) : undefined
  if (name1 && name2 && acc1 && acc2) {
    if (base(acc1) === base(acc2)) {
      selfPairs += 1
    } else {
      const key = `${acc1},${acc2}`
      const gene1 = geneTrackFor(name1)
      const gene2 = geneTrackFor(name2)
      if (!gene1) {
        noGeneTrack.add(name1)
      }
      if (!gene2) {
        noGeneTrack.add(name2)
      }
      const bases = `${base(acc1)},${base(acc2)}`
      const incumbent = pairs.get(bases)
      if (incumbent) {
        superseded += 1
      }
      if (!incumbent || newestHalves(key) >= newestHalves(incumbent.key)) {
        pairs.set(bases, {
          key,
          entry: [track.trackId, name1, name2, gene1, gene2],
        })
      }
    }
  }
}
const kept = [...pairs.values()]
const viaUcscDb = kept.filter(({ key, entry: [, name1, name2] }) => {
  const [acc1, acc2] = key.split(',')
  return acc1 !== name1 || acc2 !== name2
}).length
const output = Object.fromEntries(kept.map(({ key, entry }) => [key, entry]))

fs.mkdirSync(path.dirname(outputPath), { recursive: true })
fs.writeFileSync(outputPath, JSON.stringify(output))

const sizeKB = (fs.statSync(outputPath).size / 1024).toFixed(0)
console.log(
  `Synteny pair index: ${kept.length} tracks ` +
    `(${viaUcscDb} named by UCSC db rather than accession), ${sizeKB} KB; ` +
    `skipped ${selfPairs} same-base pairs and ${superseded} tracks ` +
    'for a pair already indexed',
)
if (noGeneTrack.size > 0) {
  // A panel with no gene track opens on the right locus with nothing drawn,
  // which reads as "this genome has no annotation" — worth naming rather than
  // leaving to be noticed in a browser.
  console.warn(
    `No gene track resolved for ${noGeneTrack.size} assemblies; their synteny panels will open empty: ${[...noGeneTrack].join(', ')}`,
  )
}
