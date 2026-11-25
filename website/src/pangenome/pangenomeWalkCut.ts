// A window of a graph cut out of its haplotype walk file (`gfa-to-tabix
// --walks`), as the tables of the GFA Bandage draws: the reference over the
// window, every haplotype's walk through it, and the nodes and links they
// visit. @jbrowse/graph-walks' contained cutRegion keeps each walk within the
// window, so a copy-number locus draws the window rather than every detour.
// Where the file abridged a walk, a placeholder node stands in for each of its
// runs off the reference, unless `expand` names its haplotype.

import { WALK_BUDGETS, WalkReader, panSNHaplotype } from '@jbrowse/graph-walks'

import { PageFile } from './pangenomeTabix.ts'

import type { ParsedRegion } from './pangenomeRegion.ts'
import type { GraphTables } from '@jbrowse/graph-walks'

// bp of the reference's path kept past each end, the context BandageJS cuts
const CONTEXT_BP = 1000

// The most nodes the page lays out. LPA's KIV-2 window, the largest an example
// draws, holds 22,357.
const NODE_LIMIT = 30_000

// The most placeholders a cut keeps: one stands in for each run off the
// reference of each abridged walk, and `nodeLimit` does not count them. The
// fold merges nearly all of them, so HLA's per-row cuts draw with 363,766,
// while its whole 90 kb window holds 1,189,936 and is refused.
const PLACEHOLDER_LIMIT = 500_000

const readers = new Map<string, WalkReader>()

export function walkReader(url: string) {
  let reader = readers.get(url)
  if (!reader) {
    reader = WalkReader.open(url, u => new PageFile(u))
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
      placeholderLimit: PLACEHOLDER_LIMIT,
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

// Each haplotype the cut left abridged, with the steps the walk file abridged
// across its walks and departures, and the bp of the placeholders standing for
// its runs off the reference, each counted once though a walk and its
// departure both step on it
export function abridgedWalks({
  nodes,
  walks,
  departures,
}: GraphTables): AbridgedWalk[] {
  const steps = new Map<string, number>()
  const placeholders = new Map<string, Set<number>>()
  const add = (name: string, held: Int32Array, count = 0) => {
    const haplotype = panSNHaplotype(name) ?? name
    if (count > 0) {
      steps.set(haplotype, (steps.get(haplotype) ?? 0) + count)
    }
    for (const i of held) {
      if (nodes.placeholders?.[i]) {
        placeholders.set(
          haplotype,
          (placeholders.get(haplotype) ?? new Set<number>()).add(i),
        )
      }
    }
  }
  walks.names.forEach((name, p) => {
    add(
      name,
      walks.steps.subarray(walks.offsets[p], walks.offsets[p + 1]),
      walks.abridgedSteps?.[p],
    )
  })
  departures.names.forEach((name, k) => {
    add(
      name,
      departures.steps.subarray(
        departures.offsets[k],
        departures.offsets[k + 1],
      ),
      departures.abridgedSteps?.[k],
    )
  })
  return Array.from(steps, ([haplotype, count]) => {
    let bp = 0
    for (const i of placeholders.get(haplotype) ?? []) {
      bp += nodes.lengths[i] ?? 0
    }
    return { haplotype, steps: count, bp }
  })
}
