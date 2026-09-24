// Reads meta.json paths on stdin, for every GCA hub with a xenoRefGene track:
//
//   paths                   prints its bigBed's path under hubs/, which
//                           xenoSymbolIndex.sh rsyncs into the mirror
//   build <symbols> <mirror> writes trix/<accession>.ix/.ixx/_meta.json from
//                           the mirrored bigBed and the accession -> symbol
//                           table cut from gene2refseq
//
// A hub is rebuilt when its index is missing, older than its mirrored bigBed
// (whose mtime rsync -t keeps from upstream) or than the symbol table, or
// REPROCESS is set. Building never asks UCSC for anything.
import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import * as readline from 'readline'
import { Readable } from 'stream'
import * as zlib from 'zlib'

import { BigBed } from '@gmod/bbi'
import { generateJBrowseConfigForAssemblyHub, readJSON } from 'hubtools'
import { ixIxxStream } from 'ixixx'

import { xenoSymbolIndexLines } from './xenoSymbolIndex.ts'

const CONCURRENCY = 8

const [mode, symbolsFile, mirror] = process.argv.slice(2)
if (mode !== 'paths' && !(mode === 'build' && symbolsFile && mirror)) {
  console.error(
    'usage: buildXenoSymbolIndexes.ts paths | build <symbols.tsv.gz> <mirror> <meta-list',
  )
  process.exit(1)
}

function xenoRefGeneUrl(accession: string, hubDir: string, hubUrl: string) {
  const config = generateJBrowseConfigForAssemblyHub({
    hubFileText: fs.readFileSync(path.join(hubDir, 'hub.txt'), 'utf8'),
    trackDbUrl: hubUrl,
  })
  const adapter = config.tracks.find(
    t => t.trackId === `${accession}-xenoRefGene`,
  )?.adapter
  return adapter &&
    typeof adapter === 'object' &&
    'uri' in adapter &&
    typeof adapter.uri === 'string'
    ? adapter.uri
    : undefined
}

function hubPath(url: string) {
  return url.split('/hubs/')[1]
}

function readSymbols(file: string) {
  const symbols = new Map<string, string>()
  for (const line of zlib
    .gunzipSync(fs.readFileSync(file))
    .toString()
    .split('\n')) {
    const tab = line.indexOf('\t')
    if (tab > 0) {
      symbols.set(line.slice(0, tab), line.slice(tab + 1))
    }
  }
  return symbols
}

function isCurrent(ix: string, inputs: string[]) {
  if (process.env.REPROCESS || !fs.existsSync(ix)) {
    return false
  }
  const built = fs.statSync(ix).mtimeMs
  return inputs.every(f => fs.statSync(f).mtimeMs <= built)
}

async function buildIndex(
  symbols: Map<string, string>,
  { accession, hubDir, url, bigBedPath }: Job,
) {
  const trackId = `${accession}-xenoRefGene`
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'xeno-'))
  try {
    const bigBed = new BigBed({ path: bigBedPath })
    const { refsByName } = await bigBed.getHeader()
    const refNames = Object.keys(refsByName)
    const features = await bigBed.getFeaturesMulti(
      refNames.map(refName => ({ refName, start: 0, end: 2 ** 31 - 1 })),
    )
    const rows = refNames.flatMap((refName, i) =>
      features[i]!.map(f => ({
        refName,
        start: f.start,
        end: f.end,
        accession: f.rest?.split('\t', 1)[0] ?? '',
      })),
    )
    const lines = xenoSymbolIndexLines(rows, symbols, trackId)

    const ix = path.join(tmp, `${accession}.ix`)
    const ixx = path.join(tmp, `${accession}.ixx`)
    await ixIxxStream(Readable.from(lines), ix, ixx)
    const meta = path.join(tmp, `${accession}_meta.json`)
    fs.writeFileSync(
      meta,
      JSON.stringify(
        {
          dateCreated: new Date().toISOString(),
          tracks: [
            {
              trackId,
              attributesIndexed: ['symbol'],
              adapterConf: { type: 'BigBedAdapter', uri: url },
            },
          ],
          assemblyNames: [accession],
        },
        null,
        2,
      ),
    )
    const trixDir = path.join(hubDir, 'trix')
    fs.mkdirSync(trixDir, { recursive: true })
    // .ix last: its presence and mtime are what the gate reads.
    for (const f of [ixx, meta, ix]) {
      const dest = path.join(trixDir, path.basename(f))
      fs.copyFileSync(f, `${dest}.tmp`)
      fs.renameSync(`${dest}.tmp`, dest)
    }
    return lines.length
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true })
  }
}

interface Job {
  accession: string
  hubDir: string
  url: string
  bigBedPath: string
}

const hubs: Omit<Job, 'bigBedPath'>[] = []
const failed: string[] = []
let gca = 0
let noTrack = 0
for await (const line of readline.createInterface({ input: process.stdin })) {
  const metaPath = line.trim()
  const hubDir = path.dirname(metaPath)
  const accession = path.basename(hubDir)
  if (metaPath && accession.startsWith('GCA_')) {
    gca++
    try {
      const meta = readJSON<{ hubFileLocation: string }>(metaPath)
      const url = xenoRefGeneUrl(accession, hubDir, meta.hubFileLocation)
      if (url && hubPath(url)) {
        hubs.push({ accession, hubDir, url })
      } else {
        noTrack++
      }
    } catch (error) {
      failed.push(`${accession}: ${error}`)
    }
  }
}

if (mode === 'paths') {
  for (const { url } of hubs) {
    console.log(hubPath(url))
  }
  console.error(
    `xenoRefGene symbol index: ${gca} GCA hubs, ${noTrack} without the track, ${hubs.length} bigBeds to mirror`,
  )
  process.exit(0)
}

const queue: Job[] = []
let notMirrored = 0
for (const hub of hubs) {
  const bigBedPath = path.join(mirror!, hubPath(hub.url)!)
  if (!fs.existsSync(bigBedPath)) {
    notMirrored++
  } else if (
    !isCurrent(path.join(hub.hubDir, 'trix', `${hub.accession}.ix`), [
      bigBedPath,
      symbolsFile!,
    ])
  ) {
    queue.push({ ...hub, bigBedPath })
  }
}

console.error(
  `xenoRefGene symbol index: ${gca} GCA hubs, ${noTrack} without the track, ${notMirrored} not mirrored, ${queue.length} to build`,
)

const symbols = readSymbols(symbolsFile!)
let built = 0
let records = 0
async function worker() {
  for (let job = queue.shift(); job; job = queue.shift()) {
    try {
      records += await buildIndex(symbols, job)
      built++
      if (built % 500 === 0) {
        console.error(`  ${built} built`)
      }
    } catch (error) {
      failed.push(`${job.accession}: ${error}`)
    }
  }
}
await Promise.all(Array.from({ length: CONCURRENCY }, worker))

console.error(
  `xenoRefGene symbol index: ${built} built (${records} records), ${failed.length} failed`,
)
for (const f of failed.slice(0, 10)) {
  console.error(`  ${f}`)
}
if (failed.length > 10) {
  console.error(`  ... and ${failed.length - 10} more`)
}
