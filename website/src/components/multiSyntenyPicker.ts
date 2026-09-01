// Choosing which genomes go into the multi-species synteny launch.
//
// The auto-inferred chain is one arbitrary path through a sparse catalog, and it
// cannot be anything else: a LinearSyntenyView is a linear stack, so every
// adjacent pair needs a precomputed liftOver track and each genome appears once.
// For TP53 against human that means 38 species have a track straight to human
// and exactly two of them — the row above and the row below — can use it. Which
// two was decided by COMMON_TAX_RANK and then alphabetically, so the launch
// offered wild yak and chicken while chimp, gorilla and dog sat unused. This
// module is what lets a reader pick instead, and orders the offer by how close
// each species actually is to the reference.

import { orthologSyntenyLink, planMultiSynteny } from './orthologSearchUtils.ts'

import type { OrthologResult } from './orthologSearchUtils.ts'
import type { PairIndex } from './syntenyPairIndex.ts'

// A stacked synteny view puts one full genome browser on screen per genome, so
// past a dozen or so nothing in it is readable. The gene-order drill-down opens
// DEFAULT_SUBTREE_GENOMES (multiSyntenyDrilldown.ts) for the same reason.
export const MAX_PICKED_GENOMES = 12

// How close two species are, as the number of ancestors their NCBI lineages
// share. Bigger is closer: human and chimp share everything up to Homininae,
// human and chicken stop at Vertebrata. An unknown lineage scores 0 and sorts
// last, which is what an unplaced taxon should do.
export function sharedAncestors(
  lineages: Map<number, Set<number>> | undefined,
  a: number,
  b: number,
) {
  const la = lineages?.get(a)
  const lb = lineages?.get(b)
  if (!la || !lb) {
    return 0
  }
  let n = 0
  for (const id of la) {
    if (lb.has(id)) {
      n += 1
    }
  }
  return n
}

// The rows worth offering: everything that has a synteny track to at least one
// other row, since a genome with no track anywhere can never take a place in the
// stack. Ordered by proximity to the reference, then by name so the answer is
// stable — the reference itself is not in the list, because it is always in the
// launch.
//
// This order matters twice. It is what the reader reads, and planMultiSynteny
// treats a row's index as its preference rank, so passing the same order through
// is what makes the auto-chain reach for chimp before chicken.
export function syntenyCandidates(
  results: OrthologResult[],
  refAccession: string,
  refTaxonId: number,
  index: PairIndex,
  lineages: Map<number, Set<number>> | undefined,
) {
  // orthologSyntenyLink rather than syntenyLink: a row whose panel would open a
  // different version of its own genome cannot be placed anywhere in the stack,
  // so offering it would be offering a checkbox that opens an unnavigated panel.
  // Both ends have to hold, since either one is a panel.
  const linked = results.filter(
    r =>
      r.assembly.accession !== refAccession &&
      results.some(
        o =>
          o.assembly.accession !== r.assembly.accession &&
          orthologSyntenyLink(index, r, o.assembly.accession) &&
          orthologSyntenyLink(index, o, r.assembly.accession),
      ),
  )
  return linked.sort((a, b) => {
    const d =
      sharedAncestors(lineages, refTaxonId, b.assembly.taxonId) -
      sharedAncestors(lineages, refTaxonId, a.assembly.taxonId)
    return d !== 0
      ? d
      : a.assembly.scientificName.localeCompare(b.assembly.scientificName)
  })
}

export interface PickedPlan {
  plan: ReturnType<typeof planMultiSynteny>
  // Picked species the chain could not place: the stack is a path, so a pick
  // whose only synteny partners are already surrounded has nowhere to go. Naming
  // them is the whole point — dropping them silently is what made the auto-chain
  // look arbitrary.
  unplaced: OrthologResult[]
}

// Plan a launch over the reference plus a chosen set. Ordering the input by the
// candidate order (not by whatever order the checkboxes were clicked in) keeps
// the chain deterministic: the same selection always yields the same stack.
export function planFromSelection(
  candidates: OrthologResult[],
  refResult: OrthologResult,
  selected: ReadonlySet<string>,
  index: PairIndex,
): PickedPlan {
  const picked = candidates.filter(r => selected.has(r.assembly.accession))
  const plan = planMultiSynteny(
    [refResult, ...picked],
    refResult.assembly.accession,
    index,
  )
  const chained = new Set(plan?.rows.map(r => r.assembly.accession))
  return {
    plan,
    unplaced: picked.filter(r => !chained.has(r.assembly.accession)),
  }
}

// The selection a reader is shown before touching anything: whatever the
// unrestricted chain would have used. Offering an empty picker would make them
// build the common case by hand, and offering every candidate would launch a
// stack of 50 browsers.
export function suggestedSelection(
  candidates: OrthologResult[],
  refResult: OrthologResult,
  index: PairIndex,
) {
  const plan = planMultiSynteny(
    [refResult, ...candidates],
    refResult.assembly.accession,
    index,
  )
  return new Set(
    (plan?.rows ?? [])
      .map(r => r.assembly.accession)
      .filter(a => a !== refResult.assembly.accession),
  )
}
