import type { FinalizeStep } from './utils/finalizeStep.ts'

//
// GenArk-backed UCSC aliases (rn8, Fca126_mat1.0, GRCg7b, ...) are served at
// /ucsc/<db>/config.json but their hub.txt declares `genome <accession>`, so
// generateJBrowseConfigForAssemblyHub names the assembly after the accession
// and the UCSC db name appears nowhere in the config. Two consequences:
//
// - anything referencing the assembly by db name fails to resolve, which makes
//   the hubs plugin treat it as an unrecognized assembly and load this very
//   config back as a connection, duplicating every track
// - the displayName comes from the hub's shortLabel, which for some assemblies
//   (e.g. GRCg7b) never mentions the UCSC name the user clicked on
//
// Adding the db name as an alias fixes resolution without renaming the
// assembly, so the accession-based trackIds and assemblyNames stay canonical.
// The displayName is rewritten to match the `<organism> (<db>)` form that
// createAssembly.ts uses for native golden-path assemblies.
//

export const ensureUcscAssemblyNames: FinalizeStep = {
  name: 'UCSC assembly names',
  run: ({ assemblyName, genome, config }) => {
    const counts: Record<string, number> = {}
    const assembly = config.assemblies[0]

    // no list.json entry means UCSC does not serve this db, so there is no db
    // name to alias and no organism to name it after
    if (genome && assembly && assembly.name !== assemblyName) {
      if (!assembly.aliases?.includes(assemblyName)) {
        assembly.aliases = [...(assembly.aliases ?? []), assemblyName]
        counts.aliased = 1
      }
      const { organism } = genome
      if (organism) {
        const displayName = `${organism} (${assemblyName})`
        if (assembly.displayName !== displayName) {
          assembly.displayName = displayName
          counts.renamed = 1
        }
      }
    }

    return counts
  },
}
