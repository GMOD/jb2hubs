import fs from 'fs'
import path from 'path'

import {
  recordedTextIndexStamp,
  textIndexStamp,
  trixAdapter,
  trixIndexOf,
} from 'hubtools'

import { GFF_DIR } from './addNcbiRefSeqGffTrack.ts'

import type { FinalizeContext, FinalizeStep } from './utils/finalizeStep.ts'

//
// The assembly's trix text index covers its ncbiRefSeq gene track and its NCBI
// RefSeq GFF track, whichever it has. `jbrowse text-index` builds it after the
// config is written (textIndex.sh, over what `textIndexPlan` reports), because
// it reads the indexing policy off the GFF track's textSearching slot; this
// step only wires the adapter up.
//
// The index is named after the config's assembly, which for a GenArk-backed
// alias is the accession rather than the db: that is what the CLI names it,
// and looking for `trix/<db>.ix` instead is why rn8 was re-indexed on every
// run and never got its adapter from this step.
//
// genark2jbrowse/src/buildConfig.ts builds the same node through hubtools'
// trixAdapter.
//

// What `jbrowse text-index` indexes the ncbiRefSeq gene track by, which
// carries no policy of its own; textIndex.sh passes it as --attributes.
export const UCSC_TEXT_INDEX_ATTRIBUTES = ['Name', 'ID', 'gene_synonym']

function textIndexTarget({ assemblyName, dir, config }: FinalizeContext) {
  const asm = config.assemblies[0]?.name ?? assemblyName
  const ixPath = path.join(dir, 'trix', `${asm}.ix`)
  const present = new Set(config.tracks.map(t => t.trackId))
  const tracks = [
    `${assemblyName}-ncbiRefSeq`,
    `${assemblyName}-ncbiRefSeqGff`,
  ].filter(t => present.has(t))
  return { asm, ixPath, tracks, hasIndex: fs.existsSync(ixPath) }
}

// The index is stale when it is missing, older than a file it covers, or
// stamped under another policy or text-indexing-core.
export function textIndexPlan(ctx: FinalizeContext, indexer: string) {
  const { assemblyName, dir, config } = ctx
  const { asm, ixPath, tracks, hasIndex } = textIndexTarget(ctx)
  // the files the index is built from, at their source: the built dir's copy
  // of the NCBI GFF is a link whose mtime is the download's, but an older copy
  // made by `jbrowse add-track` carries the copy time instead
  const sources = [
    path.join(dir, 'ncbiRefSeq.gff.gz'),
    path.join(GFF_DIR, `${assemblyName}.gff.gz`),
  ].filter(f => fs.existsSync(f))
  const ixMtime = hasIndex ? fs.statSync(ixPath).mtimeMs : -1
  const stamp = textIndexStamp(
    indexer,
    config.tracks.filter(t => tracks.includes(t.trackId)),
    UCSC_TEXT_INDEX_ATTRIBUTES,
  )
  const needsIndex =
    tracks.length > 0 &&
    (!!process.env.REPROCESS ||
      !hasIndex ||
      sources.some(f => fs.statSync(f).mtimeMs > ixMtime) ||
      recordedTextIndexStamp(path.dirname(ixPath)) !== stamp)
  return { asm, tracks, needsIndex, stamp }
}

export const ensureTextSearchAdapters: FinalizeStep = {
  name: 'text search adapters',
  run: ctx => {
    const counts: Record<string, number> = {}
    const { asm, hasIndex, tracks } = textIndexTarget(ctx)
    const { config } = ctx

    if (hasIndex || tracks.length > 0) {
      const adapter = trixAdapter(asm)
      const existing = config.aggregateTextSearchAdapters ?? []
      const ours = (a: Record<string, unknown>) =>
        trixIndexOf(a) === trixIndexOf(adapter)
      if (existing.some(ours)) {
        config.aggregateTextSearchAdapters = existing.map(a =>
          ours(a) ? adapter : a,
        )
      } else {
        config.aggregateTextSearchAdapters = [...existing, adapter]
        counts.added = 1
      }
    }

    return counts
  },
}
