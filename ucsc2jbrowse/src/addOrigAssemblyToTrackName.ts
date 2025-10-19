import { readConfig, writeJSON } from './util.ts'

function addOrigAssemblyToTrackName(configPath: string) {
  const config = readConfig(configPath)
  for (const track of config.tracks) {
    if (track.metadata?.ucsc?.origAssembly) {
      track.name = `${track.name} (${track.metadata.ucsc.origAssembly})`
    }
  }
  writeJSON(configPath, config)
}

if (process.argv.length !== 3) {
  console.error('Usage: node addOrigAssemblyToTrackName.ts <config.json>')
  process.exit(1)
}

addOrigAssemblyToTrackName(process.argv[2]!)
