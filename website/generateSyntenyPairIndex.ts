import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const inputPath = path.join(__dirname, 'src/syntenyTracks.json')
const outputPath = path.join(__dirname, 'public/synteny_pairs.json')

interface Track {
  trackId: string
  assemblyNames: string[]
}

interface SyntenyData {
  tracks: Track[]
}

const data: SyntenyData = JSON.parse(fs.readFileSync(inputPath, 'utf-8'))

// Build a lookup: "${assemblyNames[0]},${assemblyNames[1]}" -> trackId
// Only include tracks where both assemblies are GCF (the ortholog index is GCF-only)
// Storing the key in assemblyNames order lets the consumer choose which assembly
// is the synteny "target" by controlling the key lookup order.
const pairs: Record<string, string> = {}
for (const track of data.tracks) {
  const [a1, a2] = track.assemblyNames
  if (a1?.startsWith('GCF_') && a2?.startsWith('GCF_')) {
    pairs[`${a1},${a2}`] = track.trackId
  }
}

fs.mkdirSync(path.dirname(outputPath), { recursive: true })
fs.writeFileSync(outputPath, JSON.stringify(pairs))

const sizeKB = (fs.statSync(outputPath).size / 1024).toFixed(0)
console.log(
  `Synteny pair index: ${Object.keys(pairs).length} GCF tracks, ${sizeKB} KB`,
)
