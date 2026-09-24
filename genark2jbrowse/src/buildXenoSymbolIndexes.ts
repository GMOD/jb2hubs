// Builds trix/<accession>.ix/.ixx/_meta.json for every GCA hub with a
// xenoRefGene track, from its bigBed and the accession -> symbol table
// xenoSymbolIndex.sh cuts from gene2refseq. Reads meta.json paths on stdin.
//
// A hub is rebuilt when its index is missing, older than the upstream bigBed
// (UPSTREAM_HUB_LIST, when the listing ran), or REPROCESS is set. With the
// listing, a bigBed it does not name is gone upstream and is not asked for.
import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import * as readline from 'readline'
import { Readable } from 'stream'
import * as zlib from 'zlib'

import { BigBed } from '@gmod/bbi'
import {
  generateJBrowseConfigForAssemblyHub,
  myfetch,
  readJSON,
} from 'hubtools'
import { ixIxxStream } from 'ixixx'

import { xenoSymbolIndexLines } from './xenoSymbolIndex.ts'

const CONCURRENCY = 8

const [symbolsFile] = process.argv.slice(2)
if (!symbolsFile) {
  console.error('usage: buildXenoSymbolIndexes.ts <symbols.tsv.gz> <meta-list')
  process.exit(1)
}

const symbols = new Map<string, string>()
for (const line of zlib
  .gunzipSync(fs.readFileSync(symbolsFile))
  .toString()
  .split('\n')) {
  const tab = line.indexOf('\t')
  if (tab > 0) {
    symbols.set(line.slice(0, tab), line.slice(tab + 1))
  }
}

// accession -> mtime of its bbi/*.xenoRefGene.bb, from listUpstreamHubs.sh
function readUpstreamBigBeds(file: string) {
  const mtimes = new Map<string, number>()
  for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
    const [accession, name, , mtime] = line.split('\t')
    if (accession && name?.endsWith('.xenoRefGene.bb') && mtime) {
      mtimes.set(accession, new Date(mtime.replace(/\//g, '-')).getTime())
    }
  }
  return mtimes
}
// Empty when the listing fell back to the rsync walk, which never enters bbi/.
const listed = process.env.UPSTREAM_HUB_LIST
  ? readUpstreamBigBeds(process.env.UPSTREAM_HUB_LIST)
  : undefined
const upstream = listed?.size ? listed : undefined

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

function isCurrent(ix: string, accession: string) {
  if (process.env.REPROCESS || !fs.existsSync(ix)) {
    return false
  }
  const upstreamMs = upstream?.get(accession)
  return upstreamMs === undefined || upstreamMs <= fs.statSync(ix).mtimeMs
}

// hgdownload drops connections and stalls on connect under load, so each round
// also asks hgdownload2, which serves the same tree from another address block.
// Whichever host answered last is asked first: with the primary unreachable,
// every hub otherwise paid its 10 s connect timeout.
let mirrorFirst = false
async function fetchBytes(url: string, rounds = 3) {
  const mirror = url.replace('//hgdownload.soe.', '//hgdownload2.soe.')
  let lastError: unknown
  for (let i = 0; i < rounds; i++) {
    if (i > 0) {
      await new Promise(r => setTimeout(r, 3000 * i))
    }
    for (const u of mirrorFirst ? [mirror, url] : [url, mirror]) {
      try {
        const res = await myfetch(u)
        mirrorFirst = u === mirror && u !== url
        return res
      } catch (error) {
        lastError = error
      }
    }
  }
  throw lastError
}

async function buildIndex(accession: string, hubDir: string, url: string) {
  const trackId = `${accession}-xenoRefGene`
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'xeno-'))
  try {
    const bbPath = path.join(tmp, 'xenoRefGene.bb')
    const res = await fetchBytes(url)
    fs.writeFileSync(bbPath, new Uint8Array(await res.arrayBuffer()))
    const bigBed = new BigBed({ path: bbPath })
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

const queue: { accession: string; hubDir: string; url: string }[] = []
const failed: string[] = []
let gca = 0
let noTrack = 0
let goneUpstream = 0
for await (const line of readline.createInterface({ input: process.stdin })) {
  const metaPath = line.trim()
  const hubDir = path.dirname(metaPath)
  const accession = path.basename(hubDir)
  if (metaPath && accession.startsWith('GCA_')) {
    gca++
    let url: string | undefined
    try {
      const meta = readJSON<{ hubFileLocation: string }>(metaPath)
      url = xenoRefGeneUrl(accession, hubDir, meta.hubFileLocation)
    } catch (error) {
      failed.push(`${accession}: ${error}`)
      continue
    }
    if (!url) {
      noTrack++
    } else if (upstream && !upstream.has(accession)) {
      goneUpstream++
    } else if (
      !isCurrent(path.join(hubDir, 'trix', `${accession}.ix`), accession)
    ) {
      queue.push({ accession, hubDir, url })
    }
  }
}

console.error(
  `xenoRefGene symbol index: ${gca} GCA hubs, ${noTrack} without the track, ${goneUpstream} with its bigBed missing upstream, ${queue.length} to build`,
)

let built = 0
let records = 0
async function worker() {
  for (let job = queue.shift(); job; job = queue.shift()) {
    try {
      const result = await buildIndex(job.accession, job.hubDir, job.url)
      records += result
      built++
      if (built % 500 === 0) {
        console.error(`  ${built} built`)
      }
    } catch (error) {
      const cause =
        error instanceof Error && error.cause ? ` (${error.cause})` : ''
      failed.push(`${job.accession}: ${error}${cause}`)
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
