// Two ways of cutting an ortholog set into clades, sharing one vocabulary of
// NCBI taxon ids.
//
// SCOPES narrow the *query*: NCBI's orthologs endpoint takes repeated
// `taxon_filter` params and unions them, so asking for mammals returns 271 rows
// instead of 558 and downloads a fifth of the bytes.
//
// GROUPS cut the *answer*: a result set of several hundred species is a wall of
// alphabetised binomials, and grouping it under Primates / Rodents / Birds is
// what makes it readable. Membership is an id test against the row's lineage
// (from the taxonomy subtree), not a name match, so a species is in Primates
// because NCBI's tree puts it there.

// One entry of the ladder. `id` is the taxon that defines membership; a row
// belongs to the FIRST entry whose id is on its lineage, so the list runs
// most-specific first and each broad "other" entry mops up what its own
// narrower siblings above did not take.
export interface Clade {
  id: number
  label: string
}

// Order matters twice over: it decides which clade a row falls into, and it is
// the order the groups render in. Roughly phylogenetic, mammals first, because
// that is where the annotated genomes are.
export const CLADE_LADDER: Clade[] = [
  { id: 9443, label: 'Primates' },
  { id: 9989, label: 'Rodents' },
  { id: 9975, label: 'Rabbits, hares & pikas' },
  { id: 33554, label: 'Carnivores' },
  { id: 91561, label: 'Even-toed ungulates & whales' },
  { id: 9787, label: 'Odd-toed ungulates' },
  { id: 9397, label: 'Bats' },
  { id: 9362, label: 'Insectivores' },
  { id: 9347, label: 'Other placental mammals' },
  { id: 9263, label: 'Marsupials' },
  { id: 9255, label: 'Monotremes' },
  { id: 40674, label: 'Other mammals' },
  { id: 8782, label: 'Birds' },
  { id: 1294634, label: 'Crocodilians' },
  { id: 8459, label: 'Turtles' },
  { id: 8504, label: 'Lizards & snakes' },
  { id: 8292, label: 'Amphibians' },
  { id: 7898, label: 'Ray-finned fishes' },
  { id: 7777, label: 'Sharks & rays' },
  { id: 1476529, label: 'Jawless fishes' },
  { id: 7711, label: 'Other chordates' },
  { id: 50557, label: 'Insects' },
  { id: 6656, label: 'Other arthropods' },
  { id: 6231, label: 'Roundworms' },
  { id: 33208, label: 'Other animals' },
  { id: 33090, label: 'Plants' },
  { id: 4751, label: 'Fungi' },
  { id: 2759, label: 'Other eukaryotes' },
]

// Where a lineage lands on the ladder, as an index so callers can sort by it.
// A lineage matching nothing — an unplaced taxon, or one the subtree omitted —
// sorts past every named clade into the trailing "Unclassified" group.
export function cladeIndex(lineage: Set<number> | undefined) {
  const i = CLADE_LADDER.findIndex(c => lineage?.has(c.id))
  return i === -1 ? CLADE_LADDER.length : i
}

export interface CladeGroup<T> {
  label: string
  rows: T[]
}

// Cut rows into ladder-ordered, non-empty clade groups. Rows keep their incoming
// order within a group, so whatever the caller sorted by still shows through.
//
// `pinned` is the reference species' taxon, and its clade leads regardless of
// where the ladder puts it. The ladder starts at Primates, so without this a
// zebrafish search would open on a list of monkeys and bury the zebrafish row
// eighteen groups down — the comparison a reader came for is the one against
// their own reference.
export function groupByClade<T>(
  rows: T[],
  taxonIdOf: (row: T) => number,
  lineages: Map<number, Set<number>>,
  pinned?: number,
): CladeGroup<T>[] {
  const byClade = new Map<number, T[]>()
  for (const row of rows) {
    const i = cladeIndex(lineages.get(taxonIdOf(row)))
    const bucket = byClade.get(i)
    if (bucket) {
      bucket.push(row)
    } else {
      byClade.set(i, [row])
    }
  }
  // Only a reference we actually placed leads. Falling back to cladeIndex's
  // no-match answer would promote the trailing Unclassified group instead,
  // which is the opposite of what an unknown reference should do.
  const pinnedLineage = pinned === undefined ? undefined : lineages.get(pinned)
  const lead = pinnedLineage && cladeIndex(pinnedLineage)
  return [...byClade.entries()]
    .sort(([a], [b]) => (a === lead ? -1 : b === lead ? 1 : a - b))
    .map(([i, groupRows]) => ({
      label: CLADE_LADDER[i]?.label ?? 'Unclassified',
      rows: groupRows,
    }))
}

// A query scope offered in the form. `taxa` is empty for "every species", which
// is the unfiltered endpoint; otherwise its ids become repeated `taxon_filter`
// params and NCBI unions them, which is how "reptiles" can be three sibling
// clades in one request.
export interface OrthologScope {
  id: string
  label: string
  taxa: number[]
}

// The unfiltered query, named separately because it is also the fallback.
export const DEFAULT_SCOPE: OrthologScope = {
  id: 'all',
  label: 'Every species',
  taxa: [],
}

export const ORTHOLOG_SCOPES: OrthologScope[] = [
  DEFAULT_SCOPE,
  { id: 'vertebrates', label: 'Vertebrates', taxa: [7742] },
  { id: 'mammals', label: 'Mammals', taxa: [40674] },
  { id: 'primates', label: 'Primates', taxa: [9443] },
  { id: 'rodents', label: 'Rodents', taxa: [9989] },
  { id: 'birds', label: 'Birds', taxa: [8782] },
  { id: 'reptiles', label: 'Reptiles', taxa: [8504, 8459, 1294634] },
  { id: 'amphibians', label: 'Amphibians', taxa: [8292] },
  { id: 'fishes', label: 'Fishes', taxa: [7898, 7777, 1476529] },
  { id: 'insects', label: 'Insects', taxa: [50557] },
  { id: 'plants', label: 'Plants', taxa: [33090] },
  { id: 'fungi', label: 'Fungi', taxa: [4751] },
]

// A scope id from a url or a form value, falling back to "every species" so a
// stale bookmark still searches rather than erroring.
export function scopeById(id: string | null | undefined) {
  return ORTHOLOG_SCOPES.find(s => s.id === id) ?? DEFAULT_SCOPE
}
