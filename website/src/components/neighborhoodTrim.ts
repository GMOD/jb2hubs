// Which species the gene-order figure keeps when more qualify than fit: rings
// of kinship around the reference, each given its share of the rows.

import { leafOrder } from './multiSyntenyTaxonTree.ts'
import { COMMON_TAX_RANK } from './referenceSpecies.ts'

import type { TaxonNode } from './multiSyntenyTaxonTree.ts'
import type { Neighborhood } from './neighborhood.ts'

// Rows with too few anchors carry little synteny signal and just lengthen the
// figure, so it keeps the most informative species, tree order intact. Three,
// tried 2026-10-15, cut human HBB's figure from 15 species to 4: most hold
// orthologs of only two of its neighbours.
const MIN_ANCHORS = 2
export const MAX_SPECIES = 80

// The species outside each successively larger clade around the reference,
// innermost first: for human, the other Homininae, then the orangutans, the
// gibbons, the Old World monkeys, and so on out to the root. A species the tree
// does not place lands in a last ring of its own.
export function kinshipRings(tree: TaxonNode | undefined, refTaxonId: number) {
  const path: TaxonNode[] = []
  function find(node: TaxonNode): boolean {
    path.push(node)
    if (node.taxonId === refTaxonId || node.children.some(c => find(c))) {
      return true
    }
    path.pop()
    return false
  }
  const rings: number[][] = []
  if (tree && find(tree)) {
    const seen = new Set([refTaxonId])
    for (const ancestor of path.toReversed().slice(1)) {
      const ring = leafOrder(ancestor).filter(t => !seen.has(t))
      ring.forEach(t => seen.add(t))
      rings.push(ring)
    }
  } else if (tree) {
    rings.push(leafOrder(tree))
  }
  return rings
}

// `quota` items of `items`, the model organisms first and the rest spread
// evenly through the list, which is tree order: an even spread samples every
// sub-clade of the ring rather than the head of one.
function sample(items: number[], quota: number) {
  const models = items.filter(t => COMMON_TAX_RANK.has(t)).slice(0, quota)
  const rest = items.filter(t => !COMMON_TAX_RANK.has(t))
  const n = Math.min(rest.length, quota - models.length)
  return [
    ...models,
    ...Array.from(
      { length: n },
      (_, j) => rest[Math.floor(((j + 0.5) * rest.length) / n)]!,
    ),
  ]
}

// When more species qualify than fit, every ring around the reference gets a
// fair share of the rows, innermost first, and a ring too small for its share
// passes the rest outward. So the figure keeps the reference's closest
// relatives and still reaches the model organisms and the far clades. A slice
// of the tree-ordered list around the reference, which this replaced, opened a
// human TP53 figure on ten newts and caecilians and left out mouse, dog,
// chicken and zebrafish. Returns how many species were eligible, so the caller
// can disclose the cap.
export function trimNeighborhood(nb: Neighborhood, max = MAX_SPECIES) {
  const eligible = nb.species.filter(s => s.genes.length >= MIN_ANCHORS)
  if (eligible.length <= max) {
    return { nb: { ...nb, species: eligible }, eligible: eligible.length }
  }
  const refTaxonId = nb.query.refTaxonId
  const present = new Set(eligible.map(s => s.taxonId))
  const placedInTree = new Set(nb.tree ? leafOrder(nb.tree) : [])
  const rings = [
    ...kinshipRings(nb.tree, refTaxonId),
    eligible.map(s => s.taxonId).filter(t => !placedInTree.has(t)),
  ]
    .map(ring => ring.filter(t => present.has(t) && t !== refTaxonId))
    .filter(ring => ring.length > 0)
  const kept = new Set(present.has(refTaxonId) ? [refTaxonId] : [])
  let budget = max - kept.size
  // Fair shares first, then a second pass hands what small rings left over to
  // the rings nearest the reference.
  const shares = rings.map((ring, i) => {
    const share = Math.min(ring.length, Math.ceil(budget / (rings.length - i)))
    budget -= share
    return share
  })
  rings.forEach((ring, i) => {
    const share = shares[i] ?? 0
    const more = Math.min(ring.length - share, budget)
    budget -= more
    sample(ring, share + more).forEach(t => kept.add(t))
  })
  return {
    nb: { ...nb, species: eligible.filter(s => kept.has(s.taxonId)) },
    eligible: eligible.length,
  }
}
