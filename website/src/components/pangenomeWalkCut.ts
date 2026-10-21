// A window of a graph cut out of its haplotype walk file (`gfa-to-tabix
// --walks`), as the tables of the GFA Bandage draws: the reference over the
// window, every haplotype's walk through it, and the nodes and links they
// visit. @jbrowse/graph-walks' contained cutRegion keeps each walk within the
// window, so a copy-number locus draws the window rather than every detour.
// Where the file abridged a walk (walk format 5), the cut keeps only the two
// reference nodes it leaves and rejoins at, unless `expand` names its
// haplotype.

import { WALK_BUDGETS, WalkReader, panSNHaplotype } from '@jbrowse/graph-walks'

import { tabixFile } from './pangenomeTabix.ts'

import type { ParsedRegion } from './pangenomeRegion.ts'
import type { GraphTables } from '@jbrowse/graph-walks'

// bp of the reference's path kept past each end, the context BandageJS cuts
const CONTEXT_BP = 1000

// The most nodes the page lays out. LPA's KIV-2 window, the largest an example
// draws, holds 22,357.
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
  expand: string[] = [],
  signal?: AbortSignal,
) {
  const { tables } = await reader.cutRegion(
    { refName: chrom, start, end },
    {
      context: CONTEXT_BP,
      byteBudget: WALK_BUDGETS.byteBudget,
      nodeLimit: NODE_LIMIT,
      contained: true,
      expand: name => expand.includes(panSNHaplotype(name) ?? ''),
      signal,
    },
  )
  return tables
}

export interface AbridgedWalk {
  haplotype: string
  steps: number
  bp: number
}

export function abridgedWalks({ walks }: GraphTables): AbridgedWalk[] {
  return walks.names.flatMap((name, p) => {
    const steps = walks.abridgedSteps?.[p] ?? Number.NaN
    return Number.isNaN(steps)
      ? []
      : [
          {
            haplotype: panSNHaplotype(name) ?? name,
            steps,
            bp: walks.abridgedBp?.[p] ?? 0,
          },
        ]
  })
}
