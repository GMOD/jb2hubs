import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const inputPath = path.join(__dirname, 'src/syntenyTracks.json')
const orthologIndexPath = path.join(__dirname, 'public/ortholog_index.json')
const ucscConfigDir = path.join(__dirname, '../ucsc2jbrowse/configs')
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
const ucscToAccession = new Map<string, string>()
const byBase = new Map<string, string>()
const version = (accession: string) => Number(/\.(\d+)$/.exec(accession)?.[1])
for (const [accession, ucscDb] of Object.entries(orthologIndex.ucscDb)) {
  ucscToAccession.set(ucscDb, accession)
}
for (const accession of orthologIndex.accessions) {
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
    (hosted.has(name) ? name : byBase.get(name.replace(/\.\d+$/, '')))
  )
}

// The gene track a launched panel should open for one genome, under whichever
// name that genome's synteny track calls it. A LinearSyntenyView sub-view gets
// no defaultSession, so a panel with no explicit track is an empty browser —
// which is what every synteny launch used to be: right locus, nothing drawn.
//
// The NCBI RefSeq GFF3 is the one to prefer on both sides: gene -> mRNA ->
// CDS/exon with the real attributes, against UCSC's genePred-derived bigBeds.
// GenArk hubs carry it as `<accession>-ncbiGff` without exception (checked
// against all 170 GenArk names in this catalog on 2026-08-27), which is also the
// id the single-genome launch in accessionToJbrowseUrl asks for.
//
// A UCSC db spells the same thing `<db>-ncbiRefSeqGff`, but only the 75
// NCBI-derived assemblies have one — 20 of the 26 UCSC names here. The rest fall
// back to that config's own defaultSession, which already names the best gene
// track it has (generateDefaultSessions picked it), rather than re-implementing
// that preference order in a second place. Guessing `ncbiRefSeq` for them would
// open nothing: xenTro3 and bosTau6 are refGene, melGal1 is ensGene.
interface UcscConfig {
  tracks?: { trackId?: string }[]
  defaultSession?: {
    views?: { init?: { tracks?: string[] } }[]
  }
}
const geneTrackCache = new Map<string, string | undefined>()
function geneTrackFor(name: string) {
  if (/^GC[AF]_/.test(name)) {
    return `${name}-ncbiGff`
  }
  if (!geneTrackCache.has(name)) {
    const file = path.join(ucscConfigDir, `${name}.json`)
    const config: UcscConfig | undefined = fs.existsSync(file)
      ? JSON.parse(fs.readFileSync(file, 'utf-8'))
      : undefined
    const gff = `${name}-ncbiRefSeqGff`
    geneTrackCache.set(
      name,
      config?.tracks?.some(t => t.trackId === gff)
        ? gff
        : config?.defaultSession?.views?.[0]?.init?.tracks?.[0],
    )
  }
  return geneTrackCache.get(name)
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
// itself.
const pairs: Record<string, [string, string, string, string, string]> = {}
const base = (accession: string) => accession.replace(/\.\d+$/, '')
let viaUcscDb = 0
let selfPairs = 0
let collisions = 0
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
      if (pairs[key]) {
        collisions += 1
      }
      const gene1 = geneTrackFor(name1) ?? ''
      const gene2 = geneTrackFor(name2) ?? ''
      if (!gene1) {
        noGeneTrack.add(name1)
      }
      if (!gene2) {
        noGeneTrack.add(name2)
      }
      pairs[key] = [track.trackId, name1, name2, gene1, gene2]
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
if (noGeneTrack.size > 0) {
  // A panel with no gene track opens on the right locus with nothing drawn,
  // which reads as "this genome has no annotation" — worth naming rather than
  // leaving to be noticed in a browser.
  console.warn(
    `No gene track resolved for ${noGeneTrack.size} assemblies; their synteny panels will open empty: ${[...noGeneTrack].join(', ')}`,
  )
}
