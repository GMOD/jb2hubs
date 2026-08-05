import fs from 'fs'
import path from 'path'

import type { FinalizeStep } from './utils/finalizeStep.ts'

//
// Wires up the trix index an assembly already has on disk. The same
// aggregateTextSearchAdapters node is built by add_trix_adapter (jq) in
// genark2jbrowse/common.sh, so the two have to stay in step.
//

export const ensureTextSearchAdapters: FinalizeStep = {
  name: 'text search adapters',
  run: ({ assemblyName, dir, config }) => {
    const counts: Record<string, number> = {}
    const ixPath = path.join(dir, 'trix', `${assemblyName}.ix`)

    if (fs.existsSync(ixPath)) {
      const adapterId = `${assemblyName}-index`
      const existing = config.aggregateTextSearchAdapters

      if (!existing?.some(a => a.textSearchAdapterId === adapterId)) {
        config.aggregateTextSearchAdapters = [
          ...(existing ?? []),
          {
            type: 'TrixTextSearchAdapter',
            textSearchAdapterId: adapterId,
            ixFilePath: {
              uri: `trix/${assemblyName}.ix`,
              locationType: 'UriLocation',
            },
            ixxFilePath: {
              uri: `trix/${assemblyName}.ixx`,
              locationType: 'UriLocation',
            },
            metaFilePath: {
              uri: `trix/${assemblyName}_meta.json`,
              locationType: 'UriLocation',
            },
            assemblyNames: [assemblyName],
          },
        ]
        counts.added = 1
      }
    }

    return counts
  },
}
