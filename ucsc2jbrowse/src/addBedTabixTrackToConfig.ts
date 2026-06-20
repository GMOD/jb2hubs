import path from 'path'

import { readConfig, writeJSON } from './util.ts'

function bedTabixTrack(assemblyName: string, bedFilePath: string) {
  const bedFileName = path.basename(bedFilePath)
  const trackId = path.basename(bedFileName, '.bed.gz')
  return {
    type: 'FeatureTrack',
    trackId: `${assemblyName}-${trackId}`,
    name: trackId,
    assemblyNames: [assemblyName],
    adapter: {
      type: 'BedTabixAdapter',
      bedGzLocation: { uri: bedFileName },
      index: {
        indexType: 'CSI',
        location: { uri: `${bedFileName}.csi` },
      },
    },
  }
}

function addBedTabixTracksToConfig(configPath: string, bedFilePaths: string[]) {
  const config = readConfig(configPath)
  const assemblyName = config.assemblies[0]?.name

  if (!assemblyName) {
    throw new Error('Assembly name not found in config')
  }

  for (const bedFilePath of bedFilePaths) {
    const newTrack = bedTabixTrack(assemblyName, bedFilePath)
    const existingTrackIndex = config.tracks.findIndex(
      track => track.trackId === newTrack.trackId,
    )
    if (existingTrackIndex === -1) {
      config.tracks.push(newTrack)
    } else {
      config.tracks[existingTrackIndex] = newTrack
    }
  }

  writeJSON(configPath, config)
}

if (process.argv.length < 4) {
  console.error(
    'Usage: node addBedTabixTrackToConfig.ts <config.json> <file.bed.gz> [file2.bed.gz ...]',
  )
  process.exit(1)
}

addBedTabixTracksToConfig(process.argv[2]!, process.argv.slice(3))
