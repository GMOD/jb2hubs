/* eslint-disable no-console */
import fs from 'fs'
import path from 'path'

const MM10_ASSEMBLY = {
  name: 'mm10',
  displayName: 'Mouse (mm10)',
  sequence: {
    type: 'ReferenceSequenceTrack',
    trackId: 'mm10-refseq',
    adapter: {
      type: 'TwoBitAdapter',
      uri: 'https://hgdownload.soe.ucsc.edu/goldenPath/mm10/bigZips/mm10.2bit',
      chromSizes:
        'https://hgdownload.soe.ucsc.edu/goldenPath/mm10/bigZips/mm10.chrom.sizes',
    },
  },
  refNameAliases: {
    adapter: {
      type: 'RefNameAliasAdapter',
      uri: 'https://hgdownload.soe.ucsc.edu/goldenPath/mm10/bigZips/mm10.chromAlias.txt',
    },
  },
  cytobands: {
    adapter: {
      type: 'CytobandAdapter',
      uri: 'https://hgdownload.soe.ucsc.edu/goldenPath/mm10/database/cytoBand.txt.gz',
    },
  },
}

const MOUSE_STRAINS_DIR = 'hubs/mouseStrains'

for (const strainDir of fs.readdirSync(MOUSE_STRAINS_DIR)) {
  const configPath = path.join(MOUSE_STRAINS_DIR, strainDir, 'config.json')
  const liftOverDir = path.join(MOUSE_STRAINS_DIR, strainDir, 'liftOver')

  if (!fs.existsSync(configPath)) {
    continue
  }

  if (!fs.existsSync(liftOverDir)) {
    continue
  }

  const pifFiles = fs
    .readdirSync(liftOverDir)
    .filter(f => f.endsWith('.pif.gz'))

  if (pifFiles.length === 0) {
    continue
  }

  const config = JSON.parse(fs.readFileSync(configPath, 'utf8')) as {
    assemblies: { name: string }[]
    tracks: { trackId: string; [key: string]: unknown }[]
    [key: string]: unknown
  }

  // Add mm10 assembly if not already present
  const hasM10 = config.assemblies.some(a => a.name === 'mm10')
  if (!hasM10) {
    config.assemblies.push(MM10_ASSEMBLY)
  }

  // Add SyntenyTrack for each PIF file
  const existingTrackIds = new Set(config.tracks.map(t => t.trackId))
  let added = 0

  for (const pifFile of pifFiles) {
    const trackId = `${strainDir}_to_mm10_synteny`
    if (existingTrackIds.has(trackId)) {
      continue
    }
    config.tracks.push({
      type: 'SyntenyTrack',
      trackId,
      name: `${strainDir} to mm10 alignments`,
      category: ['Pairwise alignments'],
      assemblyNames: [strainDir, 'mm10'],
      adapter: {
        type: 'PairwiseIndexedPAFAdapter',
        targetAssembly: strainDir,
        queryAssembly: 'mm10',
        pifGzLocation: { uri: `liftOver/${pifFile}` },
        index: {
          location: { uri: `liftOver/${pifFile}.csi` },
          indexType: 'CSI',
        },
      },
    })
    existingTrackIds.add(trackId)
    added++
  }

  if (!hasM10 || added > 0) {
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2) + '\n')
    console.log(
      `${strainDir}: added mm10 assembly=${!hasM10}, synteny tracks=${added}`,
    )
  }
}
