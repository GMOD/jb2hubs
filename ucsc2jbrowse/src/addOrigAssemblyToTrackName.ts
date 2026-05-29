import { readConfig, writeJSON } from './util.ts'

function addOrigAssemblyToTrackName(configPath: string) {
  const config = readConfig(configPath)
  for (const track of config.tracks) {
    const orig = track.metadata?.ucsc?.origAssembly
    if (orig) {
      const suffix = `(${orig})`
      if (!track.name.endsWith(suffix)) {
        track.name = `${track.name} ${suffix}`
      }
    }
  }
  writeJSON(configPath, config)
}

if (process.argv.length !== 3) {
  console.error('Usage: node addOrigAssemblyToTrackName.ts <config.json>')
  process.exit(1)
}

addOrigAssemblyToTrackName(process.argv[2]!)
