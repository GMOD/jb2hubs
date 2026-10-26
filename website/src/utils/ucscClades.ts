import type { UcscListEntry } from './hubListings.ts'
import type { TaxonomyIndex } from './taxonomyCache.ts'

export interface UcscCladeRow {
  db: string
  organism: string
  description: string
  // Hosted GenArk accessions of the same assembly, per mapAccessionsToUcsc
  accessions: string[]
}

// The UCSC dbs at or under each taxon of the tree, in UCSC's own order. Keyed
// by taxId rather than by GenArk twin, because most dbs (hg19, mm10, every
// older build) are assemblies GenArk never hosted. A db whose taxon the tree
// lacks sits under no taxon.
export function ucscDbsByTaxon(
  index: TaxonomyIndex,
  genomes: Record<string, UcscListEntry>,
  accessionsByDb: Map<string, string[]>,
) {
  const byTaxon = new Map<string, UcscCladeRow[]>()
  const ordered = Object.entries(genomes).sort(
    ([, a], [, b]) => a.orderKey - b.orderKey,
  )
  for (const [db, genome] of ordered) {
    const row = {
      db,
      organism: genome.organism,
      description: genome.description,
      accessions: accessionsByDb.get(db) ?? [],
    }
    for (const { taxonId } of index.lineage(String(genome.taxId))) {
      if (taxonId) {
        byTaxon.set(taxonId, [...(byTaxon.get(taxonId) ?? []), row])
      }
    }
  }
  return byTaxon
}
