import * as fs from 'fs'
import * as path from 'path'

import {
  type UCSCGenArkAssemblyEntry,
  dedupe,
  myfetchtext,
  readJSON,
} from 'hubtools'

import { getHubBasePath } from './util.ts'

// Helper to log to stderr (keeps stdout clean for piping)
const log = (msg: string) => {
  console.error(msg)
}

// Read all hub JSON files and deduplicate entries based on ucscBrowser field
const allHubEntries = dedupe(
  fs
    .readdirSync('hubJson')
    .filter(f => f.endsWith('.json'))
    .flatMap(
      f => readJSON<{ data: UCSCGenArkAssemblyEntry[] }>(`hubJson/${f}`).data,
    ),
  d => d.ucscBrowser,
)

/**
 * Processes a single assembly hub entry: downloads its hub.txt and creates a
 * meta.json file.
 *
 * @param entry - The UCSCGenArkAssemblyEntry object.
 * @param idx - The current index of the entry in the list.
 * @param totalEntries - The total number of entries being processed.
 */
async function processHubEntry({
  entry,
  idx,
  totalEntries,
}: {
  entry: UCSCGenArkAssemblyEntry
  idx: number
  totalEntries: number
}) {
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

  // Determine the accession ID, preferring ucscBrowser if it starts with 'GC', otherwise refSeq or genBank
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

  if (!fs.existsSync(hubFilePath) || process.env.REPROCESS) {
    log(`Processing ${idx + 1}/${totalEntries}: ${sciName} (${accession})`)

    await new Promise(resolve => setTimeout(resolve, 100))

    const hubFileDownloadLocation = `https://hgdownload.soe.ucsc.edu/${hubBasePath}/hub.txt`

    fs.mkdirSync(hubBasePath, { recursive: true })

    try {
      fs.writeFileSync(hubFilePath, await myfetchtext(hubFileDownloadLocation))
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
      // Output new hub path to stdout for piping to downstream commands
      console.log(metaFilePath)
    } catch (error) {
      log(`Failed to download or write hub files for ${accession}: ${error}`)
    }
  }
}

// Iterate over all hub entries and process them sequentially (polite to UCSC servers)
for (const [idx, entry] of allHubEntries.entries()) {
  try {
    await processHubEntry({
      entry,
      idx,
      totalEntries: allHubEntries.length,
    })
  } catch (e) {
    log(`Error processing entry: ${e}`)
  }
}
