// A window of a graph cut out of its haplotype walk file (`gfa-to-tabix
// --walks`), as the tables of the GFA Bandage draws: the reference over the
// window, every haplotype's walk through it, and the nodes and links they
// visit. @jbrowse/graph-walks decodes the rows, as it does for BandageJS and
// the graph plugin's lane track.

import { WALK_BUDGETS, WalkReader } from '@jbrowse/graph-walks'

import { tabixFile } from './pangenomeTabix.ts'

import type { ParsedRegion } from './pangenomeRegion.ts'

// bp of the reference's path kept past each end, the context BandageJS cuts
const CONTEXT_BP = 1000

const readers = new Map<string, WalkReader>()

export function walkReader(url: string) {
  let reader = readers.get(url)
  if (!reader) {
    reader = new WalkReader(tabixFile(url, 'tbi'))
    readers.set(url, reader)
  }
  return reader
}

export async function cutWalks(
  reader: WalkReader,
  region: ParsedRegion,
  signal?: AbortSignal,
) {
  const { references } = await reader.header({ signal })
  const sample = references[0] ?? ''
  const refName = await reader.sequenceFor(sample, region.chrom, { signal })
  if (refName === undefined) {
    throw new Error(`${region.chrom} is not a sequence of ${sample}'s walks`)
  }
  const { graph, kept, fragments } = await reader.cut(refName, region, {
    ...WALK_BUDGETS,
    context: CONTEXT_BP,
    signal,
  })
  return graph.tables(kept, fragments)
}
