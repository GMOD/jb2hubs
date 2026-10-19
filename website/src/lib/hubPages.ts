import fs from 'fs'
import path from 'path'

import { hubCategories } from 'hubtools'

import {
  categoryTable,
  subtreeTable,
  taxonAccessionsUrl,
} from '../components/DataTable/hubRow.ts'
import { notEmpty } from '../components/DataTable/utils.ts'
import { hasHubListing, readHubListing } from '../utils/hubListings.ts'
import {
  TREE_NODE_BUDGET,
  budgetTree,
  collectAccessions,
  getCachedTree,
  getTaxonomyIndex,
} from '../utils/taxonomyCache.ts'

import type { HubSource, HubTableData } from '../components/DataTable/hubRow.ts'
import type { TaxonomyNode } from '../utils/taxonomyCache.ts'

export interface TaxonomyPageProps {
  table: HubTableData
  rowCount: number
  speciesData: HubSource[]
  isCategory: boolean
  taxonId?: string
  // Cut to the render budget; the table and accession list come from the
  // whole subtree.
  precomputedSubtree: TaxonomyNode | null
  precomputedLineage?: TaxonomyNode[]
}

interface TaxonomyPath {
  params: { slug: string }
  props: TaxonomyPageProps
}

const categorySlugs = new Set(hubCategories.map(c => c.id))

// One entry per GenArk category. processedHubJson also holds all.json, their
// union, and ucsc.json, the UCSC genome list, whose rows are dbs.
export function loadCategoryHubs() {
  return [...categorySlugs]
    .filter(hasHubListing)
    .map(slug => ({ slug, data: readHubListing<HubSource>(slug) }))
}

export function taxonomyPaths(): TaxonomyPath[] {
  const categoryPaths = loadCategoryHubs().map(({ slug, data }) => {
    const tree = getCachedTree(slug)
    return {
      params: { slug },
      props: {
        // The tree shows first, so the table fetches its rows when opened.
        table: { ...categoryTable(slug, data), initialRows: [] },
        rowCount: data.length,
        speciesData: data,
        isCategory: true,
        precomputedSubtree: tree && budgetTree(tree, TREE_NODE_BUDGET),
      },
    }
  })
  return [...categoryPaths, ...taxonPaths()]
}

// Refuses rather than building no taxon pages: accession pages link to every
// taxon in all.newick (taxonomyPageIds), so a silent empty set is 74K 404s.
function taxonPaths(): TaxonomyPath[] {
  const allHubs = readHubListing<HubSource>('all')
  // Indexed once rather than searched per page: a from-the-root search for
  // each of the 74K taxa cost ~7 minutes of every build.
  const taxonomy = getTaxonomyIndex('all')
  if (!taxonomy || taxonomy.taxonIds.length === 0) {
    throw new Error('all.newick yielded no taxonomy; refusing to build none')
  }
  const hubsByAccession = new Map(allHubs.map(hub => [hub.accession, hub]))
  // generateHubData.ts writes a list file only for a subtree too large to
  // inline.
  const hasListFile = (taxonId: string) =>
    fs.existsSync(
      path.join(process.cwd(), 'public', taxonAccessionsUrl(taxonId)),
    )

  const paths: TaxonomyPath[] = []
  for (const taxonId of taxonomy.taxonIds) {
    if (categorySlugs.has(taxonId)) {
      console.warn(`Skipping taxonId ${taxonId} - conflicts with a category`)
      continue
    }
    const subtree = taxonomy.subtree(taxonId)
    const speciesData = collectAccessions(subtree)
      .map(accession => hubsByAccession.get(accession))
      .filter(notEmpty)
    paths.push({
      params: { slug: taxonId },
      props: {
        table: subtreeTable(
          speciesData,
          hasListFile(taxonId) ? taxonAccessionsUrl(taxonId) : undefined,
        ),
        rowCount: speciesData.length,
        speciesData,
        isCategory: false,
        taxonId,
        precomputedSubtree: subtree && budgetTree(subtree, TREE_NODE_BUDGET),
        precomputedLineage: taxonomy.lineage(taxonId),
      },
    })
  }
  return paths
}
