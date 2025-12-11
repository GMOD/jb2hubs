import fs from 'fs'
import path from 'path'
import { execSync } from 'child_process'
import { fileURLToPath } from 'url'

interface HubDateInfo {
  accession: string
  modifiedDate: string
  createdDate: string
  modifiedTimestamp: number
  createdTimestamp: number
}

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const REPO_ROOT = path.join(__dirname, '..')
const OUTPUT_FILE = path.join(__dirname, 'src/recentlyUpdated.json')

// Load the all.json to get metadata for each hub
const allHubsPath = path.join(__dirname, 'processedHubJson/all.json')
const allHubs: Record<string, unknown>[] = JSON.parse(
  fs.readFileSync(allHubsPath, 'utf-8'),
)
const hubMetadataMap = new Map(
  allHubs.map(hub => [(hub as { accession: string }).accession, hub]),
)

// Regex to match hub accessions like GCF_000298275.1 or GCA_011750645.1
const accessionRegex = /GC[AF]_\d+\.\d+/

function getGitDatesForHubs(): Map<string, { modified: Date; created: Date }> {
  console.log('Fetching git history (single command)...')

  // Get all commits with dates and changed files in one command
  // Format: "COMMIT<tab>date" followed by changed file paths
  const gitLog = execSync(
    `git -C "${REPO_ROOT}" log --format="COMMIT%x09%ai" --name-only --diff-filter=ACMR -- hubs/`,
    { encoding: 'utf-8', maxBuffer: 500 * 1024 * 1024 },
  )

  const hubModified = new Map<string, Date>() // Most recent (first encountered)
  const hubCreated = new Map<string, Date>() // Oldest (last encountered)

  let currentDate: Date | null = null
  const lines = gitLog.split('\n')

  console.log(`Processing ${lines.length} lines of git history...`)

  for (const line of lines) {
    if (line.startsWith('COMMIT\t')) {
      // Parse date from "COMMIT\t2025-12-09 20:36:27 -0800"
      const dateStr = line.substring(7)
      currentDate = new Date(dateStr)
    } else if (line && currentDate) {
      // Extract accession from file path like "hubs/GCF/022/846/515/GCF_022846515.1/config.json"
      const match = line.match(accessionRegex)
      if (match) {
        const accession = match[0]
        // First encounter = most recent modification
        if (!hubModified.has(accession)) {
          hubModified.set(accession, currentDate)
        }
        // Keep updating created - last encounter = oldest (first commit)
        hubCreated.set(accession, currentDate)
      }
    }
  }

  // Combine into result map
  const result = new Map<string, { modified: Date; created: Date }>()
  for (const [accession, modified] of hubModified) {
    const created = hubCreated.get(accession) ?? modified
    result.set(accession, { modified, created })
  }

  return result
}

function main() {
  const hubDates = getGitDatesForHubs()
  console.log(`Found ${hubDates.size} hubs with git history`)

  const hubDateInfos: HubDateInfo[] = []

  for (const [accession, dates] of hubDates) {
    hubDateInfos.push({
      accession,
      modifiedDate: dates.modified.toISOString(),
      createdDate: dates.created.toISOString(),
      modifiedTimestamp: dates.modified.getTime(),
      createdTimestamp: dates.created.getTime(),
    })
  }

  // Sort by modified date (most recent first)
  hubDateInfos.sort((a, b) => b.modifiedTimestamp - a.modifiedTimestamp)

  // Enrich with metadata from all.json
  const enrichedData = hubDateInfos.map(hub => {
    const metadata = hubMetadataMap.get(hub.accession) as
      | Record<string, unknown>
      | undefined
    return {
      ...hub,
      scientificName: metadata?.scientificName ?? 'Unknown',
      commonName: metadata?.commonName ?? 'Unknown',
      source: metadata?.source ?? 'Unknown',
      jbrowseLink: metadata?.jbrowseLink ?? '',
      ncbiLink: metadata?.ncbiLink ?? '',
      ucscBrowserLink: metadata?.ucscBrowserLink ?? '',
    }
  })

  // Write the output
  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(enrichedData, null, 2))
  console.log(`Written ${enrichedData.length} entries to ${OUTPUT_FILE}`)

  // Also output top 10 for quick reference
  console.log('\nTop 10 most recently updated:')
  enrichedData.slice(0, 10).forEach((hub, i) => {
    console.log(
      `${i + 1}. ${hub.accession} - ${hub.commonName} (${new Date(hub.modifiedDate).toLocaleDateString()})`,
    )
  })
}

main()
