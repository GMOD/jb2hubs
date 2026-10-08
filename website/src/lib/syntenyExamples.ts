import type {
  SourceFilter,
  SyntenyAssembly,
  SyntenyCatalog,
} from './syntenyCatalog.ts'

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
  {
    label: 'D. melanogaster ⇄ D. simulans',
    assembly: 'dm6',
    assembly2: 'droSim1',
  },
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
      catalog
        .listPartners(ex.assembly, filter)
        .some(a => a.id === ex.assembly2),
  )
}

// The model organisms' current builds, in the order a visitor expects them. An
// unfiltered picker lists alphabetically, which opens on "A. gambiae".
export const FEATURED_ASSEMBLIES = [
  'hg38',
  'mm39',
  'rn7',
  'panTro6',
  'rheMac10',
  'canFam4',
  'bosTau9',
  'susScr11',
  'galGal6',
  'xenTro10',
  'danRer11',
  'dm6',
  'ce11',
  'sacCer3',
]

// Featured assemblies first, in FEATURED_ASSEMBLIES order; the rest keep the
// order they came in.
export function featuredFirst(assemblies: SyntenyAssembly[]) {
  const rank = new Map(FEATURED_ASSEMBLIES.map((id, i) => [id, i]))
  const featured = assemblies
    .filter(a => rank.has(a.id))
    .sort((a, b) => rank.get(a.id)! - rank.get(b.id)!)
  return [...featured, ...assemblies.filter(a => !rank.has(a.id))]
}

function formatOption(asm: SyntenyAssembly) {
  const parts = [asm.displayName]
  if (asm.scientificName && asm.scientificName !== asm.displayName) {
    parts.push(asm.scientificName)
  }
  parts.push(asm.id)
  return parts.join('  ·  ')
}

// A picker's options, featured first. A picker breaks equally good matches by
// this order, so it decides which build Enter picks.
export function assemblyOptions(assemblies: SyntenyAssembly[]) {
  return featuredFirst(assemblies).map(asm => ({
    value: asm.id,
    label: formatOption(asm),
  }))
}
