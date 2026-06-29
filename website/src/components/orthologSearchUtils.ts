import { mergeConfig, specUrl } from './jbrowseLinks.ts'

import type { Assembly, AssemblyStore } from './orthologDb.ts'

export type { Assembly, AssemblyIndex, AssemblyStore } from './orthologDb.ts'
export { createStore } from './orthologDb.ts'

export const COMMON_SPECIES = [
  { label: 'Human', taxId: 9606 },
  { label: 'Mouse', taxId: 10090 },
  { label: 'Rat', taxId: 10116 },
  { label: 'Zebrafish', taxId: 7955 },
  { label: 'Chicken', taxId: 9031 },
  { label: 'Dog', taxId: 9615 },
  { label: 'Cow', taxId: 9913 },
  { label: 'Pig', taxId: 9823 },
  { label: 'Frog (X. tropicalis)', taxId: 8364 },
  { label: 'Fruitfly', taxId: 7227 },
  { label: 'C. elegans', taxId: 6239 },
  { label: 'Yeast (S. cerevisiae)', taxId: 4932 },
  { label: 'Arabidopsis', taxId: 3702 },
]

export const COMMON_TAX_RANK = new Map(
  COMMON_SPECIES.map((s, i) => [s.taxId, i]),
)

// NCBI Datasets API response shapes
interface NcbiGene {
  gene_id: string
  symbol: string
  annotations?: {
    assembly_accession: string
    genomic_locations?: {
      genomic_accession_version: string
      sequence_name: string
      genomic_range?: { begin: string; end: string }
    }[]
  }[]
}

export interface NcbiOrthologReport {
  gene: NcbiGene
}

export interface NcbiOrthologResponse {
  reports?: NcbiOrthologReport[]
  total_count?: number
}

export interface OrthologResult {
  assembly: Assembly
  geneSymbol: string
  geneId: string
  chromosome: string
  begin: number
  end: number
  locStr: string
  jbrowseUrl: string
}

export function accessionToJbrowseUrl(accession: string, loc?: string) {
  const [base = '', rest = ''] = accession.split('_')
  const digits = rest.replace(/\.\d+$/, '')
  const b1 = digits.slice(0, 3)
  const b2 = digits.slice(3, 6)
  const b3 = digits.slice(6, 9)
  const configPath = `${base}/${b1}/${b2}/${b3}/${accession}/config.json`
  const url = `https://jbrowse.org/code/jb2/latest/?config=/hubs/genark/${configPath}&assembly=${encodeURIComponent(accession)}`
  return loc ? `${url}&loc=${encodeURIComponent(loc)}` : url
}

export function orthoSyntenyUrl(
  refAccession: string,
  r: OrthologResult,
  trackId: string,
  refLoc: string | undefined,
) {
  return specUrl(mergeConfig([r.assembly.accession, refAccession]), [
    {
      type: 'LinearSyntenyView',
      tracks: [trackId],
      views: [
        { assembly: r.assembly.accession, loc: r.locStr },
        // Land the reference panel on the gene too, rather than unnavigated.
        { assembly: refAccession, ...(refLoc ? { loc: refLoc } : {}) },
      ],
    },
  ])
}

export function formatNumber(n: number) {
  return n.toLocaleString('en-US')
}

export function buildOrthologResults(
  reports: NcbiOrthologReport[],
  store: AssemblyStore,
): OrthologResult[] {
  const results: OrthologResult[] = []

  for (const { gene } of reports) {
    for (const ann of gene.annotations ?? []) {
      const assembly = store.find(ann.assembly_accession)
      if (!assembly) {
        continue
      }
      const loc = ann.genomic_locations?.[0]
      if (!loc?.genomic_range) {
        continue
      }
      const begin = parseInt(loc.genomic_range.begin)
      const end = parseInt(loc.genomic_range.end)
      const locStr = `${loc.genomic_accession_version}:${begin}-${end}`
      results.push({
        assembly,
        geneSymbol: gene.symbol,
        geneId: gene.gene_id,
        chromosome: loc.sequence_name,
        begin,
        end,
        locStr,
        jbrowseUrl: accessionToJbrowseUrl(assembly.accession, locStr),
      })
      break
    }
  }

  return results.sort((a, b) => {
    const ar = COMMON_TAX_RANK.get(a.assembly.taxonId) ?? Infinity
    const br = COMMON_TAX_RANK.get(b.assembly.taxonId) ?? Infinity
    return ar !== br
      ? ar - br
      : a.assembly.scientificName.localeCompare(b.assembly.scientificName)
  })
}
