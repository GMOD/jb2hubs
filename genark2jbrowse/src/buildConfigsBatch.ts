// One pass per hub: gathers the inputs, builds the whole config in memory, and
// writes config.json once, only when its formatted text differs from what is on
// disk. Reads meta.json paths on stdin. Prints to stdout the hub directories
// whose NCBI GFF still needs a text index (textIndex.sh consumes that list);
// everything else goes to stderr.
//
//   --out-root <dir>   write each config under <dir>/<hub path> instead of in
//                      place, and touch nothing else; for comparing a build
//                      against the committed tree.
import * as fs from 'fs'
import * as path from 'path'
import * as readline from 'readline'

import { formatJson, readJSON } from 'hubtools'

import { buildChainTracks } from './buildChainTracks.ts'
import { buildHubConfig } from './buildConfig.ts'

import type { JBrowseConfig } from 'hubtools'

const outRootIndex = process.argv.indexOf('--out-root')
const outRoot = outRootIndex === -1 ? undefined : process.argv[outRootIndex + 1]
if (outRootIndex !== -1 && !outRoot) {
  console.error('--out-root needs a directory')
  process.exit(1)
}

// bgz/<accession>_<asm>_genomic.gff.gz plus its .csi and the
// deriveGeneticCodes.sh sidecar, keyed by accession.
const bgzDir = 'bgz'
const gffByAccession = new Map<string, string>()
for (const f of fs.readdirSync(bgzDir)) {
  if (f.endsWith('.gff.gz')) {
    const [prefix, digits] = f.split('_')
    gffByAccession.set(`${prefix}_${digits}`, f)
  }
}

const commonNameByAccession = new Map<string, string>()
try {
  for (const entry of readJSON<
    ({ accession?: string; commonName?: string } | null)[]
  >('processedHubJson/all.json')) {
    if (entry?.accession && entry.commonName) {
      commonNameByAccession.set(entry.accession, entry.commonName)
    }
  }
} catch {
  console.error('Warning: could not load processedHubJson/all.json')
}

const ucscDisplayNames = new Map<string, string>()
function ucscDisplayName(db: string) {
  const cached = ucscDisplayNames.get(db)
  if (cached !== undefined) {
    return cached
  }
  let name = ''
  try {
    const config = readJSON<{ assemblies?: { displayName?: string }[] }>(
      `../ucsc2jbrowse/configs/${db}.json`,
    )
    name = config.assemblies?.[0]?.displayName ?? ''
  } catch {}
  ucscDisplayNames.set(db, name)
  return name
}

function targetCommonName(target: string, isGenArk: boolean) {
  return isGenArk
    ? (commonNameByAccession.get(target) ?? '')
    : ucscDisplayName(target)
}

function readGeneticCodes(codesPath: string) {
  const codes: Record<string, number> = {}
  for (const line of fs.readFileSync(codesPath, 'utf8').split('\n')) {
    const [seqid, code] = line.split('\t')
    if (seqid && code) {
      codes[seqid] = Number(code)
    }
  }
  return codes
}

// The hub dir's copy of the GFF is a hard link to bgz/, so a re-derived GFF is
// picked up by inode rather than by copying 100 MB again; a cross-device
// fallback copies.
function linkIntoHub(src: string, dest: string) {
  const same =
    fs.existsSync(dest) && fs.statSync(dest).ino === fs.statSync(src).ino
  if (!same) {
    fs.rmSync(dest, { force: true })
    try {
      fs.linkSync(src, dest)
    } catch {
      fs.copyFileSync(src, dest)
    }
  }
}

function trixIsCurrent(hubDir: string, accession: string, gffPath: string) {
  const ix = path.join(hubDir, 'trix', `${accession}.ix`)
  return (
    !process.env.REPROCESS &&
    fs.existsSync(ix) &&
    fs.statSync(gffPath).mtimeMs <= fs.statSync(ix).mtimeMs
  )
}

function readExtension(accession: string) {
  const file = `genArkExtensions/${accession}.json`
  return fs.existsSync(file) ? readJSON<JBrowseConfig>(file) : undefined
}

function pifFiles(hubDir: string) {
  const dir = path.join(hubDir, 'liftOver')
  return fs.existsSync(dir)
    ? fs
        .readdirSync(dir)
        .filter(f => f.endsWith('.pif.gz'))
        .sort()
    : []
}

function processOne(metaPath: string) {
  const hubDir = path.dirname(metaPath)
  const meta = readJSON<{
    accession: string
    hubFileLocation: string
    commonName?: string
    scientificName?: string
  }>(metaPath)
  const { accession } = meta
  const hubFileText = fs.readFileSync(path.join(hubDir, 'hub.txt'), 'utf8')

  const gffFile = gffByAccession.get(accession)
  const gffPath = gffFile ? path.join(bgzDir, gffFile) : undefined
  let gff:
    | { fileName: string; geneticCodes: Record<string, number> }
    | undefined
  if (gffFile && gffPath) {
    const codesPath = `${gffPath}.codes.tsv`
    if (!fs.existsSync(codesPath)) {
      throw new Error(
        `${codesPath} is missing; deriveGeneticCodes.sh has not run over ${gffFile}`,
      )
    }
    gff = { fileName: gffFile, geneticCodes: readGeneticCodes(codesPath) }
  }

  const config = buildHubConfig({
    accession,
    hubFileText,
    trackDbUrl: meta.hubFileLocation,
    gff,
    extension: readExtension(accession),
    chainTracks: buildChainTracks({
      sourceAccession: accession,
      sourceCommonName: meta.commonName ?? meta.scientificName ?? '',
      pifFiles: pifFiles(hubDir),
      targetCommonName,
    }),
  })

  const configPath = path.join(outRoot ?? '', hubDir, 'config.json')
  const text = formatJson(config)
  let existing = ''
  try {
    existing = fs.readFileSync(configPath, 'utf8')
  } catch {}
  if (text !== existing) {
    fs.mkdirSync(path.dirname(configPath), { recursive: true })
    fs.writeFileSync(configPath, text)
  }

  if (gffFile && gffPath && !outRoot) {
    linkIntoHub(gffPath, path.join(hubDir, gffFile))
    linkIntoHub(`${gffPath}.csi`, path.join(hubDir, `${gffFile}.csi`))
    if (!trixIsCurrent(hubDir, accession, gffPath)) {
      console.log(hubDir)
    }
  }
  return text !== existing
}

const rl = readline.createInterface({ input: process.stdin })
let processed = 0
let written = 0
let failed = 0
for await (const line of rl) {
  const metaPath = line.trim()
  if (metaPath) {
    try {
      if (processOne(metaPath)) {
        written++
      }
    } catch (error) {
      failed++
      console.error(`Failed: ${metaPath}: ${error}`)
    }
    processed++
    if (processed % 5000 === 0) {
      console.error(`  ${processed} processed`)
    }
  }
}
console.error(
  `Built ${processed} configs: ${written} written, ${processed - written - failed} unchanged, ${failed} failed`,
)
