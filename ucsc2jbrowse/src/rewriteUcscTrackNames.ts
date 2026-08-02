import fs from 'fs'
import path from 'path'

import { readConfig, writeJSON } from './util.ts'

const BASE_RENAMES_DIR = 'ucscRenames'

function modifyTracks(configPath: string, mappings: Record<string, string>) {
  const config = readConfig(configPath)
  const trackIds = Object.keys(mappings)

  for (const trackId of trackIds) {
    const newName = mappings[trackId]!
    if (newName === 'DELETE') {
      config.tracks = config.tracks.filter(track => track.trackId !== trackId)
    } else {
      const track = config.tracks.find(t => t.trackId === trackId)
      if (track) {
        track.name = newName
      }
    }
  }
  writeJSON(configPath, config)
}

function rewriteUcscTrackNames(targetDir: string) {
  const renameFiles = fs.readdirSync(BASE_RENAMES_DIR)

  for (const item of renameFiles) {
    const accession = item.replace('.json', '')
    const configFilePath = path.join(targetDir, accession, 'config.json')
    const mappings = JSON.parse(
      fs.readFileSync(path.join(BASE_RENAMES_DIR, item), 'utf-8'),
    )
    modifyTracks(configFilePath, mappings)
    console.log(`Updated config file: ${configFilePath}`)
  }
}

if (process.argv.length !== 3) {
  console.error('Usage: node rewriteUcscTrackNames.ts <targetDirectory>')
  process.exit(1)
}

rewriteUcscTrackNames(process.argv[2]!)
