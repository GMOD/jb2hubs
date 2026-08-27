// Curated example genes per reference species. A chip that errors is worse than
// no chip, so every symbol here was checked against NCBI Datasets' symbol
// endpoint for its taxon on 2026-08-26 — it resolves to a gene with a placed
// locus — and the human picks were checked against the 100-way name index too,
// so the alignment-source choice has both arms for all of them.
//
// The picks are textbook genes for each organism rather than a random sample:
// the point of a chip is that someone who does not have a gene in mind still
// sees the tool do something recognisable.

import type { Example } from './orthologSearchUtils.ts'

const EXAMPLES_BY_TAXON: Record<number, Example[]> = {
  9606: [
    {
      symbol: 'TP53',
      note: 'Tumour suppressor — mutated in ~half of all cancers',
    },
    { symbol: 'BRCA2', note: 'Hereditary breast/ovarian cancer, 27 exons' },
    { symbol: 'EGFR', note: 'Receptor tyrosine kinase and major drug target' },
    { symbol: 'SOD1', note: 'ALS — small and highly conserved' },
    {
      symbol: 'KRAS',
      note: 'Oncogene — small and almost invariant across vertebrates',
    },
    { symbol: 'CFTR', note: 'Cystic fibrosis chloride channel' },
    { symbol: 'HBB', note: 'β-globin (sickle cell) — tiny 3-exon gene' },
    {
      symbol: 'TTN',
      note: 'Titin — the largest human gene, extreme intron collapse',
    },
  ],
  10090: [
    { symbol: 'Trp53', note: 'p53 tumour suppressor — the mouse orthologue' },
    { symbol: 'Shh', note: 'Sonic hedgehog — limb and neural patterning' },
    { symbol: 'Brca1', note: 'Breast-cancer susceptibility gene' },
    { symbol: 'Mecp2', note: 'Rett syndrome — X-linked chromatin regulator' },
    { symbol: 'Pax6', note: 'Master eye-development transcription factor' },
    { symbol: 'Cftr', note: 'Cystic fibrosis chloride channel' },
  ],
  10116: [
    { symbol: 'Tp53', note: 'p53 tumour suppressor' },
    { symbol: 'Shh', note: 'Sonic hedgehog — developmental morphogen' },
    { symbol: 'Bdnf', note: 'Brain-derived neurotrophic factor' },
    { symbol: 'Mecp2', note: 'Rett syndrome chromatin regulator' },
    { symbol: 'Pax6', note: 'Eye-development transcription factor' },
  ],
  7955: [
    {
      symbol: 'shha',
      note: 'Sonic hedgehog a — fin and floor-plate signalling',
    },
    { symbol: 'tp53', note: 'p53 tumour suppressor' },
    { symbol: 'pax6a', note: 'Eye-development transcription factor' },
    { symbol: 'myca', note: 'MYC proto-oncogene a' },
    { symbol: 'sox2', note: 'Stem-cell / neural transcription factor' },
  ],
  9031: [
    { symbol: 'TP53', note: 'p53 tumour suppressor' },
    { symbol: 'SHH', note: 'Sonic hedgehog — limb bud patterning' },
    { symbol: 'PAX6', note: 'Eye-development transcription factor' },
    { symbol: 'BMP4', note: 'Beak morphology and skeletal patterning' },
    { symbol: 'MYC', note: 'MYC proto-oncogene' },
  ],
  9615: [
    { symbol: 'TP53', note: 'p53 tumour suppressor' },
    { symbol: 'MC1R', note: 'Coat-colour receptor — a classic breed locus' },
    { symbol: 'BRCA1', note: 'Breast-cancer susceptibility gene' },
    { symbol: 'EGFR', note: 'Receptor tyrosine kinase' },
    { symbol: 'SOD1', note: 'Degenerative myelopathy — the canine ALS model' },
  ],
  9913: [
    { symbol: 'DGAT1', note: 'Milk-fat QTL — the textbook cattle variant' },
    { symbol: 'MSTN', note: 'Myostatin — double-muscling in Belgian Blue' },
    { symbol: 'CSN2', note: 'β-casein — the A1/A2 milk protein' },
    { symbol: 'LEP', note: 'Leptin — feed intake and carcass fat' },
    { symbol: 'TP53', note: 'p53 tumour suppressor' },
  ],
  9823: [
    { symbol: 'MSTN', note: 'Myostatin — muscle-mass regulator' },
    { symbol: 'RYR1', note: 'Ryanodine receptor — porcine stress syndrome' },
    { symbol: 'IGF2', note: 'Imprinted growth factor — a muscle-mass QTL' },
    { symbol: 'LEP', note: 'Leptin — fat deposition' },
    { symbol: 'TP53', note: 'p53 tumour suppressor' },
  ],
  8364: [
    { symbol: 'shh', note: 'Sonic hedgehog — the classic morphogen' },
    { symbol: 'pax6', note: 'Eye-development transcription factor' },
    { symbol: 'tp53', note: 'p53 tumour suppressor' },
    { symbol: 'sox2', note: 'Neural / stem-cell transcription factor' },
    { symbol: 'myc', note: 'MYC proto-oncogene' },
  ],
  7227: [
    { symbol: 'Antp', note: 'Antennapedia — Hox homeotic gene' },
    { symbol: 'Ubx', note: 'Ultrabithorax — Hox gene' },
    { symbol: 'wg', note: 'wingless — the founding Wnt ligand' },
    { symbol: 'N', note: 'Notch — receptor of the Notch pathway' },
    { symbol: 'dpp', note: 'decapentaplegic — a BMP morphogen' },
    { symbol: 'w', note: 'white — the classic eye-colour gene' },
  ],
  6239: [
    { symbol: 'lin-12', note: 'Notch-family receptor — cell-fate decisions' },
    { symbol: 'daf-16', note: 'FOXO transcription factor — lifespan' },
    { symbol: 'let-60', note: 'Ras orthologue — vulval induction' },
    { symbol: 'unc-54', note: 'Muscle myosin heavy chain' },
  ],
  559292: [
    {
      symbol: 'CDC28',
      note: 'Cyclin-dependent kinase — the cell-cycle engine',
    },
    { symbol: 'ACT1', note: 'Actin — among the most conserved proteins known' },
    {
      symbol: 'GAL4',
      note: 'The transcription activator two-hybrid is built on',
    },
    { symbol: 'HSP104', note: 'Disaggregase — prion propagation' },
    { symbol: 'TUB1', note: 'α-tubulin' },
  ],
  3702: [
    { symbol: 'AG', note: 'AGAMOUS — floral organ identity (MADS-box)' },
    { symbol: 'LFY', note: 'LEAFY — floral meristem identity' },
    { symbol: 'AP1', note: 'APETALA1 — floral organ identity' },
    { symbol: 'CO', note: 'CONSTANS — photoperiodic flowering' },
    { symbol: 'PHYB', note: 'Phytochrome B — red-light photoreceptor' },
  ],
}

// Human is the fallback: a species with no curated list still gets chips, and
// human symbols are the ones most readers can name.
export function examplesFor(taxId: number): Example[] {
  return EXAMPLES_BY_TAXON[taxId] ?? EXAMPLES_BY_TAXON[9606]!
}
