/* eslint-disable no-console */
import * as fs from 'fs'

import { hubCategories, myfetchtext } from 'hubtools'

const ONE_DAY_MS = 24 * 60 * 60 * 1000

function shouldDownload(filePath: string): boolean {
  if (!fs.existsSync(filePath)) {
    return true
  }

  const stats = fs.statSync(filePath)
  const fileAge = Date.now() - stats.mtimeMs
  return fileAge > ONE_DAY_MS
}

// Downloads the list of assembly hubs from UCSC and saves them as JSON files
// in the ../website/hubJson directory.
// Only downloads if the file doesn't exist or is older than 24 hours.
for (const { id } of hubCategories) {
  const filePath = `../website/hubJson/${id}.json`

  if (shouldDownload(filePath)) {
    console.log(`Downloading ${id} hub list...`)
    fs.writeFileSync(
      filePath,
      await myfetchtext(
        `https://hgdownload.soe.ucsc.edu/hubs/${id}/assemblyList.json`,
      ),
    )
  } else {
    console.log(
      `Skipping ${id} hub list (already downloaded within last 24 hours)`,
    )
  }
}
