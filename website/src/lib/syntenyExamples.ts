import type { SourceFilter, SyntenyCatalog } from './syntenyCatalog.ts'

export interface SyntenyExample {
  label: string
  assembly: string
  assembly2: string
  // "<NCBI GeneID>:<symbol>", the same encoding the gene box keeps in the URL.
  gene?: string
}

export const SYNTENY_EXAMPLES: SyntenyExample[] = [
  { label: 'Human ⇄ Mouse', assembly: 'hg38', assembly2: 'mm39' },
  {
    label: 'Human ⇄ Mouse at TP53',
    assembly: 'hg38',
    assembly2: 'mm39',
    gene: '7157:TP53',
  },
  { label: 'Human ⇄ Chimp', assembly: 'hg38', assembly2: 'panTro6' },
  { label: 'Human ⇄ Chicken', assembly: 'hg38', assembly2: 'galGal6' },
  { label: 'Human ⇄ Zebrafish', assembly: 'hg38', assembly2: 'danRer11' },
  { label: 'Mouse ⇄ Rat', assembly: 'mm39', assembly2: 'rn7' },
  { label: 'D. melanogaster ⇄ D. simulans', assembly: 'dm6', assembly2: 'droSim1' },
]

// An example whose pair the catalog does not list under the enabled sources
// is dropped, so a button never selects something the pickers would reject.
export function availableExamples(
  catalog: SyntenyCatalog,
  filter: SourceFilter,
  examples: SyntenyExample[] = SYNTENY_EXAMPLES,
) {
  return examples.filter(
    ex =>
      catalog.listAssemblies(filter).some(a => a.id === ex.assembly) &&
      catalog.listPartners(ex.assembly, filter).some(a => a.id === ex.assembly2),
  )
}
