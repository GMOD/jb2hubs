#!/usr/bin/env node
/* eslint-disable no-console */

/**
 * generateDefaultSessions.ts
 *
 * Reads list.json and adds a defaultSession to each assembly's config.json.
 * Uses hardcoded track IDs for hg19, hg38, and hs1.
 */

import * as fs from 'fs'
import * as path from 'path'

interface UcscGenome {
  description: string
  defaultPos: string
  id: string
  name: string
  [key: string]: any
}

interface ListJson {
  ucscGenomes: Record<string, UcscGenome>
}

interface DefaultSession {
  name: string
  views: {
    id: string
    type: string
    init: {
      loc: string
      assembly: string
      tracks: string[]
    }
  }[]
  widgets: {
    hierarchicalTrackSelector: {
      id: string
      type: string
      view: string
    }
  }
  activeWidgets: {
    hierarchicalTrackSelector: string
  }
}

interface Config {
  assemblies?: any[]
  tracks?: any[]
  defaultSession?: DefaultSession
  [key: string]: any
}

// Hardcoded track mappings for specific assemblies
const HARDCODED_TRACKS: Record<string, string> = {
  hg19: 'hg19-ncbiRefSeq',
  hg38: 'hg38-ncbiRefSeq',
  hs1: 'hs1-ncbiRefSeq',
}

function generateDefaultSession(genome: UcscGenome): DefaultSession {
  const assemblyId = genome.id
  const trackId = HARDCODED_TRACKS[assemblyId] ?? `${assemblyId}-ncbiRefSeq`

  return {
    name: `${assemblyId} ${genome.description}`,
    views: [
      {
        id: 'main',
        type: 'LinearGenomeView',
        init: {
          loc: genome.defaultPos,
          assembly: assemblyId,
          tracks: [trackId],
        },
      },
    ],
    widgets: {
      hierarchicalTrackSelector: {
        id: 'hierarchicalTrackSelector',
        type: 'HierarchicalTrackSelectorWidget',
        view: 'main',
      },
    },
    activeWidgets: {
      hierarchicalTrackSelector: 'hierarchicalTrackSelector',
    },
  }
}

function main() {
  const resultsDir = process.env.UCSC_RESULTS_DIR
  if (!resultsDir) {
    console.error('Error: UCSC_RESULTS_DIR environment variable is not set')
    process.exit(1)
  }

  const listJsonPath = path.join(resultsDir, 'list.json')
  if (!fs.existsSync(listJsonPath)) {
    console.error(`Error: ${listJsonPath} does not exist`)
    process.exit(1)
  }

  console.log(`Reading ${listJsonPath}...`)
  const listJson: ListJson = JSON.parse(fs.readFileSync(listJsonPath, 'utf-8'))

  let updated = 0
  let skipped = 0

  for (const [assemblyId, genome] of Object.entries(listJson.ucscGenomes)) {
    const configPath = path.join(resultsDir, assemblyId, 'config.json')

    if (!fs.existsSync(configPath)) {
      skipped++
      continue
    }

    try {
      const config: Config = JSON.parse(fs.readFileSync(configPath, 'utf-8'))
      const defaultSession = generateDefaultSession(genome)

      config.defaultSession = defaultSession

      fs.writeFileSync(configPath, JSON.stringify(config, null, 2))
      updated++

      if (updated <= 5 || ['hg19', 'hg38', 'hs1'].includes(assemblyId)) {
        console.log(`Updated: ${assemblyId} -> ${configPath}`)
      }
    } catch (error) {
      console.error(`Error processing ${assemblyId}:`, error)
      skipped++
    }
  }

  console.log(
    `\nUpdated ${updated} config files with defaultSession (skipped ${skipped})`,
  )
}

main()
