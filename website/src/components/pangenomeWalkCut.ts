// A window of a graph cut out of its haplotype walk file (`gfa-to-tabix
// --walks`), as the tables of the GFA Bandage draws: the reference over the
// window, every haplotype's walk through it, and the nodes and links they
// visit. @jbrowse/graph-walks' cutRegion cuts it, as it does for BandageJS.

import { WALK_BUDGETS, WalkReader } from '@jbrowse/graph-walks'

import { tabixFile } from './pangenomeTabix.ts'

import type { ParsedRegion } from './pangenomeRegion.ts'

// bp of the reference's path kept past each end, the context BandageJS cuts
const CONTEXT_BP = 1000

// The most nodes the page lays out on the main thread. LPA's KIV-2 window,
// the largest an example draws, holds 22,365.
const NODE_LIMIT = 30_000

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
  { chrom, start, end }: ParsedRegion,
  signal?: AbortSignal,
) {
  const { tables } = await reader.cutRegion(
    { refName: chrom, start, end },
    {
      context: CONTEXT_BP,
      byteBudget: WALK_BUDGETS.byteBudget,
      nodeLimit: NODE_LIMIT,
      signal,
    },
  )
  return tables
}
