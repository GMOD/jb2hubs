import * as fs from 'fs'
import * as path from 'path'
import * as readline from 'readline'

import { readJSON } from 'hubtools'

// REPROCESS re-fetches every assembly. Otherwise we always fetch assemblies
// that have no metadata yet (new hubs) and, to keep already-fetched metadata
// fresh without a full reprocess, the oldest slice of assemblies whose metadata
// has aged past REFRESH_DAYS. REFRESH_MAX caps each run so upstream NCBI changes
// (status flips, re-annotation, new fields) trickle in over many runs instead of
// landing all at once in one giant diff.
//
// Age is read from the `downloaded_at` stamp written inside ncbi.json (and the
// date inside the .notfound sentinel), NOT the file mtime: mtimes are reset by a
// fresh `git clone`, so an mtime-based clock would silently stop refreshing
// after a server rebuild/restore. The embedded stamp survives clones.
const REFRESH_DAYS = 90
const REFRESH_MAX = 3000

const reprocess = !!process.env.REPROCESS
const refreshMs = REFRESH_DAYS * 24 * 60 * 60 * 1000
const now = Date.now()

const rl = readline.createInterface({ input: process.stdin })
let queued = 0
let skipped = 0
const aged: { metaPath: string; dir: string; id: string; fetchedMs: number }[] =
  []

function emit(metaPath: string, dir: string, id: string) {
  let commonName = 'Unknown'
  try {
    const meta = readJSON<{ commonName?: string }>(metaPath)
    commonName = meta.commonName ?? 'Unknown'
  } catch {
    // ignore
  }
  process.stdout.write(`${dir}|${id}|${commonName}\n`)
  queued++
}

// Epoch ms recorded in ncbi.json (`"downloaded_at": <unix seconds>`, our last
// injected key). Returns 0 when absent/unreadable so the file is treated as
// stale and gets refreshed.
function downloadedAtMs(file: string) {
  try {
    const m = /"downloaded_at"\s*:\s*(\d+)/.exec(fs.readFileSync(file, 'utf8'))
    if (m) {
      return Number(m[1]) * 1000
    }
  } catch {
    // ignore
  }
  return 0
}

// Epoch ms recorded in the .notfound sentinel ("...as of YYYY-MM-DD").
function checkedAtMs(file: string) {
  try {
    const m = /\d{4}-\d{2}-\d{2}/.exec(fs.readFileSync(file, 'utf8'))
    if (m) {
      return Date.parse(m[0])
    }
  } catch {
    // ignore
  }
  return 0
}

for await (const line of rl) {
  const metaPath = line.trim()
  if (metaPath) {
    const dir = path.dirname(metaPath)
    const id = path.basename(dir)
    const ncbiFile = path.join(dir, 'ncbi.json')
    const notFoundFile = path.join(dir, 'ncbi.json.notfound')

    if (reprocess) {
      emit(metaPath, dir, id)
    } else if (fs.existsSync(ncbiFile) && fs.statSync(ncbiFile).size > 0) {
      const fetchedMs = downloadedAtMs(ncbiFile)
      if (now - fetchedMs > refreshMs) {
        aged.push({ metaPath, dir, id, fetchedMs })
      } else {
        skipped++
      }
    } else if (fs.existsSync(notFoundFile)) {
      const fetchedMs = checkedAtMs(notFoundFile)
      if (now - fetchedMs > refreshMs) {
        aged.push({ metaPath, dir, id, fetchedMs })
      } else {
        skipped++
      }
    } else {
      emit(metaPath, dir, id)
    }
  }
}

// Refresh the oldest aged assemblies first, capped to REFRESH_MAX per run.
aged.sort((a, b) => a.fetchedMs - b.fetchedMs)
const toRefresh = aged.slice(0, REFRESH_MAX)
for (const { metaPath, dir, id } of toRefresh) {
  emit(metaPath, dir, id)
}

console.error(
  `Queued: ${queued} (new + ${toRefresh.length}/${aged.length} aged refresh), Skipped: ${skipped}`,
)
