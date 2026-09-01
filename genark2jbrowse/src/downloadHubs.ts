// Fetches each listed hub's hub.txt and writes meta.json beside it. Only hubs
// with no hub.txt yet are fetched (their meta.json path is printed on stdout);
// refreshing the rest is make.sh's rsync step. With UPSTREAM_HUB_LIST set to
// listUpstreamHubs.sh's TSV, two things the assembly list cannot say are
// reported: hubs it names that are gone from hgdownload's tree, and hubs whose
// 2bit or chrom.sizes is gone, which loadPre() fails the whole assembly on.
import * as fs from 'fs'
import * as path from 'path'

import {
  type UCSCGenArkAssemblyEntry,
  dedupe,
  myfetchtext,
  readJSON,
} from 'hubtools'

import { getHubBasePath } from './util.ts'

const log = (msg: string) => {
  console.error(msg)
}

const allHubEntries = dedupe(
  fs
    .readdirSync('hubJson')
    .filter(f => f.endsWith('.json'))
    .flatMap(
      f => readJSON<{ data: UCSCGenArkAssemblyEntry[] }>(`hubJson/${f}`).data,
    ),
  d => d.ucscBrowser,
)

// accession -> the top-level files rsync listed for it
function readUpstreamFiles(file: string) {
  const files = new Map<string, Set<string>>()
  for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
    const [accession, name] = line.split('\t')
    if (accession && name) {
      const set = files.get(accession) ?? new Set<string>()
      set.add(name)
      files.set(accession, set)
    }
  }
  return files
}

const upstream = process.env.UPSTREAM_HUB_LIST
  ? readUpstreamFiles(process.env.UPSTREAM_HUB_LIST)
  : undefined

// Named by the assembly list, absent from the tree: the ones we publish a
// config for are the finding; the rest never existed to fetch.
const retired: string[] = []
const neverExisted: string[] = []
const missingSequence: string[] = []
let fetched = 0

async function processHubEntry(entry: UCSCGenArkAssemblyEntry, idx: number) {
  const {
    taxId,
    asmId,
    genBank,
    refSeq,
    identical,
    sciName,
    comName,
    ucscBrowser,
  } = entry

  const ucscAccession = path.basename(ucscBrowser)
  const accession = ucscAccession.startsWith('GC')
    ? ucscAccession
    : refSeq || genBank

  if (!accession) {
    log(`Skipping entry ${sciName} due to missing accession identifier.`)
    return
  }

  const hubBasePath = getHubBasePath(accession)
  const metaFilePath = `${hubBasePath}/meta.json`
  const hubFilePath = `${hubBasePath}/hub.txt`
  const hubFileDownloadLocation = `https://hgdownload.soe.ucsc.edu/${hubBasePath}/hub.txt`
  const isNew = !fs.existsSync(hubFilePath)

  if (upstream) {
    const files = upstream.get(accession)
    if (!files?.has('hub.txt')) {
      ;(isNew ? neverExisted : retired).push(accession)
      return
    } else if (
      !files.has(`${accession}.2bit`) ||
      !files.has(`${accession}.chrom.sizes.txt`)
    ) {
      missingSequence.push(accession)
    }
  }

  if (isNew) {
    log(
      `Fetching ${idx + 1}/${allHubEntries.length}: ${sciName} (${accession})`,
    )
    await new Promise(resolve => setTimeout(resolve, 100))
    fs.mkdirSync(hubBasePath, { recursive: true })
    try {
      fs.writeFileSync(hubFilePath, await myfetchtext(hubFileDownloadLocation))
      fetched++
    } catch (error) {
      log(`Failed to download hub.txt for ${accession}: ${error}`)
      return
    }
  }

  if (isNew || process.env.REPROCESS) {
    fs.writeFileSync(
      metaFilePath,
      JSON.stringify(
        {
          accession,
          assembly: asmId,
          scientificName: sciName,
          commonName: comName,
          taxonId: taxId,
          identical,
          genBank,
          refSeq,
          hubFileLocation: hubFileDownloadLocation,
        },
        null,
        2,
      ),
    )
  }
  if (isNew) {
    console.log(metaFilePath)
  }
}

for (const [idx, entry] of allHubEntries.entries()) {
  try {
    await processHubEntry(entry, idx)
  } catch (e) {
    log(`Error processing entry: ${e}`)
  }
}

log(`hub.txt: ${fetched} new hub(s) fetched`)
if (retired.length > 0) {
  // The config we publish for it names files that 404. Reported, not deleted:
  // retiring a permanent url is a decision.
  log(
    `${retired.length} published hub(s) are gone upstream: ${retired.join(' ')}`,
  )
}
if (neverExisted.length > 0) {
  log(
    `${neverExisted.length} hub(s) the assembly list names have never existed upstream: ${neverExisted.join(' ')}`,
  )
}
if (missingSequence.length > 0) {
  log(
    `${missingSequence.length} hub(s) have no 2bit or chrom.sizes upstream, so their assembly cannot load: ${missingSequence.join(' ')}`,
  )
}
