import fs from 'fs'
import path from 'path'

import { GFF_DIR } from './addNcbiRefSeqGffTrack.ts'

import type { FinalizeContext, FinalizeStep } from './utils/finalizeStep.ts'

//
// The assembly's trix text index covers its ncbiRefSeq gene track and its NCBI
// RefSeq GFF track, whichever it has. `jbrowse text-index` builds it after the
// config is written (textIndex.sh, over what `textIndexPlan` reports), because
// it reads the indexing policy off the GFF track's textSearching slot; this
// step only decides whether the index is current and wires the adapter up.
//
// The index is named after the config's assembly, which for a GenArk-backed
// alias is the accession rather than the db: that is what the CLI names it,
// and looking for `trix/<db>.ix` instead is why rn8 was re-indexed on every
// run and never got its adapter from this step.
//
// The same aggregateTextSearchAdapters node is built by trixAdapter in
// genark2jbrowse/src/buildConfig.ts, so the two have to stay in step.
//

export function textIndexPlan({ assemblyName, dir, config }: FinalizeContext) {
  const asm = config.assemblies[0]?.name ?? assemblyName
  const ixPath = path.join(dir, 'trix', `${asm}.ix`)
  const present = new Set(config.tracks.map(t => t.trackId))
  const tracks = [
    `${assemblyName}-ncbiRefSeq`,
    `${assemblyName}-ncbiRefSeqGff`,
  ].filter(t => present.has(t))
  // the files the index is built from, at their source: the built dir's copy
  // of the NCBI GFF is a link whose mtime is the download's, but an older copy
  // made by `jbrowse add-track` carries the copy time instead
  const sources = [
    path.join(dir, 'ncbiRefSeq.gff.gz'),
    path.join(GFF_DIR, `${assemblyName}.gff.gz`),
  ].filter(f => fs.existsSync(f))
  const ixMtime = fs.existsSync(ixPath) ? fs.statSync(ixPath).mtimeMs : -1
  const needsIndex =
    tracks.length > 0 &&
    (!!process.env.REPROCESS ||
      ixMtime < 0 ||
      sources.some(f => fs.statSync(f).mtimeMs > ixMtime))
  return { asm, tracks, hasIndex: ixMtime >= 0, needsIndex }
}

export const ensureTextSearchAdapters: FinalizeStep = {
  name: 'text search adapters',
  run: ctx => {
    const counts: Record<string, number> = {}
    const { asm, hasIndex, needsIndex } = textIndexPlan(ctx)
    const { config } = ctx

    if (hasIndex || needsIndex) {
      const adapterId = `${asm}-index`
      const existing = config.aggregateTextSearchAdapters

      if (!existing?.some(a => a.textSearchAdapterId === adapterId)) {
        config.aggregateTextSearchAdapters = [
          ...(existing ?? []),
          {
            type: 'TrixTextSearchAdapter',
            textSearchAdapterId: adapterId,
            ixFilePath: {
              uri: `trix/${asm}.ix`,
              locationType: 'UriLocation',
            },
            ixxFilePath: {
              uri: `trix/${asm}.ixx`,
              locationType: 'UriLocation',
            },
            metaFilePath: {
              uri: `trix/${asm}_meta.json`,
              locationType: 'UriLocation',
            },
            assemblyNames: [asm],
          },
        ]
        counts.added = 1
      }
    }

    return counts
  },
}
