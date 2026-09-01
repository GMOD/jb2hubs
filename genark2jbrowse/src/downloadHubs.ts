// Fetches each listed hub's hub.txt and writes meta.json beside it. Only hubs
// with no hub.txt yet are fetched (their meta.json path is printed on stdout);
// refreshing the rest is make.sh's rsync step. With UPSTREAM_HUB_LIST set to
// listUpstreamHubs.sh's TSV, hubs the assembly list names that are gone from
// hgdownload's tree are reported.
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

function readUpstreamAccessions(file: string) {
  return new Set(
    fs
      .readFileSync(file, 'utf8')
      .split('\n')
      .map(line => line.split('\t')[0])
      .filter(Boolean),
  )
}

const upstream = process.env.UPSTREAM_HUB_LIST
  ? readUpstreamAccessions(process.env.UPSTREAM_HUB_LIST)
  : undefined

const retired: string[] = []
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

  if (upstream && !upstream.has(accession)) {
    retired.push(accession)
  }

  const hubBasePath = getHubBasePath(accession)
  const metaFilePath = `${hubBasePath}/meta.json`
  const hubFilePath = `${hubBasePath}/hub.txt`
  const hubFileDownloadLocation = `https://hgdownload.soe.ucsc.edu/${hubBasePath}/hub.txt`
  const isNew = !fs.existsSync(hubFilePath)

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
  // Listed in assemblyList.json, absent from hgdownload's tree: the config we
  // publish for it names files that 404. Reported, not deleted -- retiring a
  // permanent url is a decision.
  log(
    `${retired.length} hub(s) in the assembly list have no hub.txt upstream: ${retired.join(' ')}`,
  )
}
