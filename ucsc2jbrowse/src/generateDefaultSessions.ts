import type { DefaultSession, JBrowseConfig, UcscGenome } from './types.ts'
import type { FinalizeStep } from './utils/finalizeStep.ts'

// The assembly name in the config is not always the UCSC db name: GenArk-backed
// UCSC aliases (e.g. rn8, Fca126_mat1.0) get their assembly and track IDs named
// after the GenArk accession by generateJBrowseConfigForAssemblyHub. A
// defaultSession pointing at the db name would then reference an assembly that
// does not exist in the config, which makes the hubs plugin fire its
// Core-handleUnrecognizedAssembly handler and load the very same config again
// as a connection, duplicating every track.
function generateDefaultSession(
  genome: UcscGenome,
  config: JBrowseConfig,
): DefaultSession {
  const assemblyId = genome.id
  const assemblyName = config.assemblies[0]?.name ?? assemblyId
  const trackIds = new Set(config.tracks.map(t => t.trackId))
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

export const generateDefaultSessions: FinalizeStep = {
  name: 'default sessions',
  run: ({ genome, config }) => {
    const counts: Record<string, number> = {}

    // the session's name, location and description all come from list.json, so
    // a built directory UCSC no longer lists keeps whatever session it has
    if (genome) {
      config.defaultSession = generateDefaultSession(genome, config)
      counts.generated = 1
    }

    return counts
  },
}
