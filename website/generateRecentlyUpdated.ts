// Builds src/recentlyUpdated.json — when each GenArk hub first appeared, joined
// to the name and category the processed listing gives it. The date is in no
// upstream metadata: it comes from the git history of hubs/ in this repo, which
// is the only record of when we picked a hub up.

import { execSync } from 'child_process'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

import type { HubRecord } from './src/lib/recentlyUpdated.ts'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

const REPO_ROOT = path.join(__dirname, '..')
const ALL_HUBS_PATH = path.join(__dirname, 'processedHubJson/all.json')
const OUTPUT_FILE = path.join(__dirname, 'src/recentlyUpdated.json')

// Only the fields the table needs; all.json carries ~20 more per hub.
interface HubMetadata {
  accession: string
  scientificName: string
  commonName: string
  source: string
}

// "hubs/GCF/022/846/515/GCF_022846515.1/config.json" -> "GCF_022846515.1"
const accessionRegex = /GC[AF]_\d+\.\d+/

// When each hub first appeared, from one pass over the git history of hubs/.
// `--name-only --diff-filter=ACMR` prints the touched paths under each commit,
// and log order is newest-first, so the LAST commit naming a hub is the one that
// added it — hence the unconditional set.
function getHubCreationDates() {
  console.log('Fetching git history (single command)...')
  const gitLog = execSync(
    `git -C "${REPO_ROOT}" log --format="COMMIT%x09%ai" --name-only --diff-filter=ACMR -- hubs/`,
    { encoding: 'utf-8', maxBuffer: 500 * 1024 * 1024 },
  )

  const created = new Map<string, Date>()
  let currentDate: Date | undefined
  const lines = gitLog.split('\n')
  console.log(`Processing ${lines.length} lines of git history...`)

  for (const line of lines) {
    if (line.startsWith('COMMIT\t')) {
      // "COMMIT\t2025-12-09 20:36:27 -0800"
      currentDate = new Date(line.substring(7))
    } else if (line && currentDate) {
      const match = accessionRegex.exec(line)
      if (match) {
        created.set(match[0], currentDate)
      }
    }
  }
  return created
}

function main() {
  const allHubs: HubMetadata[] = JSON.parse(
    fs.readFileSync(ALL_HUBS_PATH, 'utf-8'),
  )
  const metadata = new Map(allHubs.map(hub => [hub.accession, hub]))

  const created = getHubCreationDates()
  console.log(`Found ${created.size} hubs with git history`)

  // A hub that is in the tree but not in the processed listing has no name, no
  // category, and no /accession/ page — getStaticPaths builds those from this
  // same all.json — so every cell and link on its row is dead. They used to be
  // emitted as "Unknown", and since a hub we cannot resolve is usually one we
  // have only just added, they were recent enough to fill 174 of the 500 rows
  // the page shows, 19 of them in the top 20. Dropped, and counted below so the
  // drop is visible rather than silent.
  const rows: HubRecord[] = []
  let unresolved = 0
  for (const [accession, date] of created) {
    const hub = metadata.get(accession)
    if (hub) {
      rows.push({
        accession,
        createdDate: date.toISOString(),
        createdTimestamp: date.getTime(),
        scientificName: hub.scientificName,
        commonName: hub.commonName,
        source: hub.source,
      })
    } else {
      unresolved += 1
    }
  }
  rows.sort((a, b) => b.createdTimestamp - a.createdTimestamp)

  // Read at build time, never served, so it is written compactly — pretty
  // printing it cost 4MB of indentation nobody looks at.
  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(rows))
  const sizeMB = (fs.statSync(OUTPUT_FILE).size / 1e6).toFixed(1)
  console.log(
    `Written ${rows.length} entries to ${OUTPUT_FILE} (${sizeMB} MB)` +
      (unresolved > 0
        ? `; skipped ${unresolved} hub(s) absent from all.json`
        : ''),
  )

  console.log('\nTop 10 most recently added:')
  for (const [i, hub] of rows.slice(0, 10).entries()) {
    console.log(
      `${i + 1}. ${hub.accession} - ${hub.commonName} (${hub.createdDate.slice(0, 10)})`,
    )
  }
}

main()
