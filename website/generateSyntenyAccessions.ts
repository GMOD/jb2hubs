/* eslint-disable no-console */
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

interface SyntenyData {
  tracks: { assemblyNames: string[] }[]
  assemblyInfo: Record<string, { source: string }>
}

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const INPUT_FILE = path.join(__dirname, 'src/syntenyTracks.json')
const OUTPUT_FILE = path.join(__dirname, 'src/syntenyAccessions.json')

const data: SyntenyData = JSON.parse(fs.readFileSync(INPUT_FILE, 'utf-8'))

// GCA/GCF accessions that take part in a launchable synteny track (both sides
// have non-legacy assembly info). Accession pages import this small list so
// they never load the multi-megabyte syntenyTracks.json.
const accessions = new Set<string>()
for (const track of data.tracks) {
  const usable = track.assemblyNames.every(name => {
    const info = data.assemblyInfo[name]
    return info && info.source !== 'legacy'
  })
  if (usable) {
    for (const name of track.assemblyNames) {
      if (name.startsWith('GCA_') || name.startsWith('GCF_')) {
        accessions.add(name)
      }
    }
  }
}

const sorted = [...accessions].sort()
fs.writeFileSync(OUTPUT_FILE, JSON.stringify(sorted))
console.log(`Synteny accessions: ${sorted.length} entries`)
