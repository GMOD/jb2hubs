import * as fs from 'fs'
import * as path from 'path'
import * as readline from 'readline'

import { readJSON } from 'hubtools'

const reprocess = !!process.env.REPROCESS

const rl = readline.createInterface({ input: process.stdin })
let queued = 0
let skipped = 0

for await (const line of rl) {
  const metaPath = line.trim()
  if (!metaPath) {
    continue
  }

  const dir = path.dirname(metaPath)
  const id = path.basename(dir)
  const ncbiFile = path.join(dir, 'ncbi.json')
  const notFoundFile = path.join(dir, 'ncbi.json.notfound')

  if (!reprocess) {
    if (fs.existsSync(ncbiFile) && fs.statSync(ncbiFile).size > 0) {
      skipped++
      continue
    }
    if (fs.existsSync(notFoundFile)) {
      skipped++
      continue
    }
  }

  let commonName = 'Unknown'
  try {
    const meta = readJSON<{ commonName?: string }>(metaPath)
    commonName = meta.commonName ?? 'Unknown'
  } catch {
    // ignore
  }

  console.log(`${dir}|${id}|${commonName}`)
  queued++
}

console.error(`Queued: ${queued}, Skipped: ${skipped}`)
