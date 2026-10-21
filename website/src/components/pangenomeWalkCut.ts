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

// each haplotype the cut left abridged, with the steps and bp left out
export function abridgedWalks({ walks }: GraphTables): AbridgedWalk[] {
  const byHaplotype = new Map<string, AbridgedWalk>()
  walks.names.forEach((name, p) => {
    const steps = walks.abridgedSteps?.[p] ?? Number.NaN
    if (!Number.isNaN(steps)) {
      const haplotype = panSNHaplotype(name) ?? name
      const w = byHaplotype.get(haplotype) ?? { haplotype, steps: 0, bp: 0 }
      w.steps += steps
      w.bp += walks.abridgedBp?.[p] ?? 0
      byHaplotype.set(haplotype, w)
    }
  })
  return [...byHaplotype.values()]
}
