// The reference species a gene search offers, the names they answer to, and
// the gene page url for one.

// The suggested reference species. `names` are alternate spellings resolved
// here, because NCBI's taxonomy search ranks "fruit fly" as D. gunungcola
// first. `replaces` lists taxon ids to read as this one.
interface CommonSpecies {
  label: string
  taxId: number
  names: string[]
  replaces?: number[]
}

export const COMMON_SPECIES: CommonSpecies[] = [
  { label: 'Human', taxId: 9606, names: ['Homo sapiens', 'H. sapiens'] },
  {
    label: 'Mouse',
    taxId: 10090,
    names: ['Mus musculus', 'M. musculus', 'house mouse'],
  },
  {
    label: 'Rat',
    taxId: 10116,
    names: ['Rattus norvegicus', 'R. norvegicus', 'Norway rat', 'brown rat'],
  },
  { label: 'Zebrafish', taxId: 7955, names: ['Danio rerio', 'D. rerio'] },
  { label: 'Chicken', taxId: 9031, names: ['Gallus gallus', 'G. gallus'] },
  {
    label: 'Dog',
    taxId: 9615,
    names: ['Canis lupus familiaris', 'Canis familiaris'],
  },
  { label: 'Cow', taxId: 9913, names: ['Bos taurus', 'cattle'] },
  { label: 'Pig', taxId: 9823, names: ['Sus scrofa'] },
  {
    label: 'Frog (X. tropicalis)',
    taxId: 8364,
    names: ['Xenopus tropicalis', 'X. tropicalis', 'tropical clawed frog'],
  },
  {
    label: 'Fruitfly',
    taxId: 7227,
    names: [
      'Drosophila melanogaster',
      'D. melanogaster',
      'Drosophila',
      'fruit fly',
      'fly',
    ],
  },
  {
    label: 'C. elegans',
    taxId: 6239,
    names: ['Caenorhabditis elegans', 'worm'],
  },
  // S288C, not species taxon 4932, which NCBI files no gene records under.
  {
    label: 'Yeast (S. cerevisiae)',
    taxId: 559292,
    names: [
      'Saccharomyces cerevisiae',
      'Saccharomyces cerevisiae S288C',
      'S. cerevisiae',
      'yeast',
      "baker's yeast",
      "brewer's yeast",
      'budding yeast',
    ],
    replaces: [4932],
  },
  {
    label: 'Arabidopsis',
    taxId: 3702,
    names: ['Arabidopsis thaliana', 'A. thaliana', 'thale cress'],
  },
]

// Reference species offered beside the model organisms, for genes that have a
// structure and genome but no ortholog table. Each taxon is the one NCBI files
// the reference genome's gene records under (MG1655 for E. coli).
const MICROBE_SPECIES: CommonSpecies[] = [
  {
    label: 'E. coli (K-12)',
    taxId: 511145,
    names: ['Escherichia coli', 'E. coli', 'Escherichia coli K-12 MG1655'],
  },
  {
    label: 'B. subtilis (168)',
    taxId: 224308,
    names: ['Bacillus subtilis', 'B. subtilis'],
  },
  {
    label: 'M. tuberculosis (H37Rv)',
    taxId: 83332,
    names: ['Mycobacterium tuberculosis', 'M. tuberculosis', 'TB'],
  },
  {
    label: 'Fission yeast (S. pombe)',
    taxId: 4896,
    names: ['Schizosaccharomyces pombe', 'S. pombe', 'fission yeast'],
  },
  {
    label: 'C. albicans',
    taxId: 237561,
    names: ['Candida albicans', 'Candida albicans SC5314'],
  },
  {
    label: 'SARS-CoV-2',
    taxId: 2697049,
    names: ['Severe acute respiratory syndrome coronavirus 2', 'COVID-19'],
  },
  {
    label: 'HIV-1',
    taxId: 11676,
    names: ['Human immunodeficiency virus 1', 'HIV'],
  },
]

export const PROTEIN_SPECIES = [...COMMON_SPECIES, ...MICROBE_SPECIES]

export const COMMON_TAX_RANK = new Map(
  COMMON_SPECIES.map((s, i) => [s.taxId, i]),
)

// Case, periods and spacing do not tell two names apart: "S. cerevisiae" and
// "s cerevisiae" are one query.
function normalName(text: string) {
  return text.trim().toLowerCase().replaceAll('.', '').replace(/\s+/g, ' ')
}

const KNOWN_NAMES = new Map(
  PROTEIN_SPECIES.flatMap(s =>
    [s.label, ...s.names].map(n => [normalName(n), s.taxId] as const),
  ),
)

// A reference resolved without a request: a taxon id, or an offered species by
// its label or any of its names. Undefined for anything NCBI has to answer.
export function knownTaxon(input: string) {
  const q = normalName(input)
  if (/^\d+$/.test(q)) {
    const id = Number(q)
    return PROTEIN_SPECIES.find(s => s.replaces?.includes(id))?.taxId ?? id
  }
  return KNOWN_NAMES.get(q)
}

// Display text for a reference-species field whose value may be a taxon id (as
// carried in ?ref=) or free text; offered species show as their label.
export function refLabel(ref: string) {
  return PROTEIN_SPECIES.find(s => String(s.taxId) === ref)?.label ?? ref
}

// The ?gene=&ref= link shape the gene-first pages (/gene, /protein-browser)
// all read back on mount.
export function geneUrl(path: string, symbol: string, taxId: number) {
  return `${path}?gene=${encodeURIComponent(symbol)}&ref=${taxId}`
}
