import path from 'path'

import { readConfig, writeJSON } from './util.ts'

function gffTabixTrack(assemblyName: string, gffFilePath: string) {
  const gffFileName = path.basename(gffFilePath)
  const trackId = path.basename(gffFileName, '.gff.gz')
  return {
    type: 'FeatureTrack',
    trackId: `${assemblyName}-${trackId}`,
    name: trackId,
    assemblyNames: [assemblyName],
    adapter: {
      type: 'Gff3TabixAdapter',
      gffGzLocation: { uri: gffFileName },
      index: {
        indexType: 'CSI',
        location: { uri: `${gffFileName}.csi` },
      },
    },
  }
}

/**
 * Adds one or more GFF3Tabix tracks to a JBrowse configuration file, reading and
 * writing the config a single time for the whole batch.
 */
function addGffTabixTracksToConfig(configPath: string, gffFilePaths: string[]) {
  const config = readConfig(configPath)
  const assemblyName = config.assemblies[0]?.name

  if (!assemblyName) {
    throw new Error('Assembly name not found in config')
  }

  for (const gffFilePath of gffFilePaths) {
    const newTrack = gffTabixTrack(assemblyName, gffFilePath)
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
    'Usage: node addGffTabixTrackToConfig.ts <config.json> <file.gff.gz> [file2.gff.gz ...]',
  )
  process.exit(1)
}

addGffTabixTracksToConfig(process.argv[2]!, process.argv.slice(3))
