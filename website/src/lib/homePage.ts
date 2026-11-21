import { hubCategories } from 'hubtools'

import { readHubListing } from '../utils/hubListings.ts'
import { loadCategoryHubs } from './hubPages.ts'
import { ucscRows } from './ucscRows.ts'

const FEATURED_DBS = new Set(['hg38', 'hg19', 'hs1', 'mm39', 'mm10'])

const withAccession = (rows: { accession: string }[]) =>
  rows.filter(row => row.accession).length

export function homePageData() {
  const ucsc = ucscRows()
  const counts = new Map(
    loadCategoryHubs().map(({ slug, data }) => [slug, withAccession(data)]),
  )
  const groups = hubCategories.flatMap(category => {
    const count = counts.get(category.id)
    const isClade = category.tag === 'main'
    return count
      ? [
          {
            id: category.id,
            label: isClade
              ? category.id.charAt(0).toUpperCase() + category.id.slice(1)
              : category.id,
            description: category.description,
            isClade,
            count,
          },
        ]
      : []
  })
  return {
    assemblyCount: ucsc.length + withAccession(readHubListing('all')),
    ucscCount: ucsc.length,
    featured: ucsc.filter(row => FEATURED_DBS.has(row.name)),
    clades: groups.filter(group => group.isClade),
    projects: groups.filter(group => !group.isClade),
  }
}
