#!/usr/bin/env node

/**
 * generateDefaultSessions.ts
 *
 * Reads list.json and adds a defaultSession to each assembly's config.json.
 * Uses hardcoded track IDs for hg19, hg38, and hs1.
 */

import * as fs from 'fs'
import * as path from 'path'

import type { DefaultSession } from './types'

interface UcscGenome {
  description: string
  defaultPos: string
  id: string
  name: string
  [key: string]: unknown
}

interface ListJson {
  ucscGenomes: Record<string, UcscGenome>
}

interface Config {
  assemblies?: { name?: string }[]
  tracks?: { trackId?: string }[]
  defaultSession?: DefaultSession
  [key: string]: unknown
}

// The assembly name in the config is not always the UCSC db name: GenArk-backed
// UCSC aliases (e.g. rn8, Fca126_mat1.0) get their assembly and track IDs named
// after the GenArk accession by generateJBrowseConfigForAssemblyHub. A
// defaultSession pointing at the db name would then reference an assembly that
// does not exist in the config, which makes the hubs plugin fire its
// Core-handleUnrecognizedAssembly handler and load the very same config again
// as a connection, duplicating every track.
function generateDefaultSession(
  genome: UcscGenome,
  config: Config,
): DefaultSession {
  const assemblyId = genome.id
  const assemblyName = config.assemblies?.[0]?.name ?? assemblyId
  const trackIds = new Set(
    config.tracks?.map(t => t.trackId).filter(t => t !== undefined),
  )
  const candidates = [
    `${assemblyName}-ncbiRefSeq`,
    `${assemblyName}-ncbiRefSeqCurated`,
    `${assemblyName}-ncbiGene`,
    `${assemblyName}-refGene`,
    `${assemblyName}-ensGene`,
    `${assemblyName}-augustusGene`,
    `${assemblyName}-xenoRefGene`,
  ]
  const trackId = candidates.find(t => trackIds.has(t))

  return {
    name: `${assemblyId} ${genome.description}`,
    views: [
      {
        id: 'main',
        type: 'LinearGenomeView',
        init: {
          loc: genome.defaultPos,
          assembly: assemblyName,
          tracks: trackId ? [trackId] : [],
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
  const resultsDir = process.env.UCSC_BUILT_DIR
  if (!resultsDir) {
    console.error('Error: UCSC_BUILT_DIR environment variable is not set')
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
      config.defaultSession = generateDefaultSession(genome, config)

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
