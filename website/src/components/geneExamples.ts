// Curated example genes per reference species. A chip that errors is worse than
// no chip, so every symbol here was checked against NCBI Datasets' symbol
// endpoint for its taxon on 2026-08-26 — it resolves to a gene with a placed
// locus — and the human picks were checked against the 100-way name index too,
// so the alignment-source choice has both arms for all of them.
//
// The picks are textbook genes for each organism rather than a random sample:
// the point of a chip is that someone who does not have a gene in mind still
// sees the tool do something recognisable.

// A curated gene chip: the symbol, and why someone might want to look at it.
export interface Example {
  symbol: string
  note: string
}

// Where a chip opens its session, and why: a residue (a hotspot, a variant), a
// Pfam family (the domain to read across life), or a binding partner (the
// complex to open instead of the monomer). Applied once the map has loaded the
// regions it names; a chip without one opens on the whole protein.
export interface ExampleFocus {
  residue?: number
  residueLabel?: string
  pfam?: string
  // first residue of the repeat meant, where the family occurs more than once
  start?: number
  // UniProt accession of the partner, as PDBe names it
  partner?: string
}

const FOCUS_PARAMS = ['residue', 'pfam', 'at', 'partner']

// The focus as search params, so a focused page is a link: `residue=248`,
// `pfam=PF00008&at=1000`, `partner=Q13233`.
export function focusToParams(
  focus: ExampleFocus | undefined,
  params: URLSearchParams,
) {
  for (const k of FOCUS_PARAMS) {
    params.delete(k)
  }
  if (focus?.residue) {
    params.set('residue', String(focus.residue))
  } else if (focus?.pfam) {
    params.set('pfam', focus.pfam)
    if (focus.start) {
      params.set('at', String(focus.start))
    }
  } else if (focus?.partner) {
    params.set('partner', focus.partner)
  }
}

export function focusFromParams(
  params: URLSearchParams,
): ExampleFocus | undefined {
  const residue = Number(params.get('residue'))
  if (Number.isInteger(residue) && residue > 0) {
    return { residue }
  }
  const pfam = params.get('pfam')
  if (pfam && /^PF\d{5}$/.test(pfam)) {
    const start = Number(params.get('at'))
    return Number.isInteger(start) && start > 0 ? { pfam, start } : { pfam }
  }
  const partner = params.get('partner')
  return partner && /^[\w-]+$/.test(partner) ? { partner } : undefined
}

export interface ProteinExample extends Example {
  focus?: ExampleFocus
  // the PDB entry that shows what the focus does, where the AlphaFold monomer
  // cannot: the DNA a residue reaches into, the crystal contact it makes
  structure?: string
}

const EXAMPLES_BY_TAXON: Record<number, ProteinExample[]> = {
  // Each human chip opens on a focus everyone has heard of: a residue, the
  // domain family that residue defines a position in, or the complex that
  // gives the residue its meaning. Each was checked live on 2026-09-11.
  9606: [
    {
      symbol: 'TP53',
      note: 'Tumour suppressor — R248, a cancer hotspot that reaches into the DNA',
      focus: { residue: 248, residueLabel: 'R248' },
      structure: '3kmd',
    },
    {
      symbol: 'BRAF',
      note: 'Kinase — V600E, the melanoma driver, in the activation segment',
      focus: { residue: 600, residueLabel: 'V600' },
      structure: '1uwh',
    },
    {
      symbol: 'HBB',
      note: 'β-globin — E6V, sickle cell, and the α/β interface it does not touch',
      focus: { residue: 7, residueLabel: 'E6V (Glu7)' },
      structure: '2hbs',
    },
    {
      symbol: 'NOTCH1',
      note: 'EGF-repeat array — one repeat, read against its family seed',
      focus: { pfam: 'PF00008' },
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
  // Bacteria, fungi and viruses. A bacterial or viral gene has no transcript
  // record at NCBI, so its coding model comes off the product_report (see
  // geneStructure.ts). Every symbol below booted in `check-protein-launches` on
  // 2026-10-08, the focused chips with their focus.
  511145: [
    {
      symbol: 'recA',
      note: 'Recombinase — the fold RAD51 keeps from bacteria to human',
    },
    { symbol: 'ftsZ', note: 'Cell-division ring — the bacterial tubulin' },
    {
      symbol: 'gyrA',
      note: 'DNA gyrase — S83, where quinolone resistance arises',
      focus: { residue: 83, residueLabel: 'S83' },
    },
    { symbol: 'rpoB', note: 'RNA polymerase β — the rifampicin target' },
    { symbol: 'dnaK', note: 'Hsp70 chaperone, nearly unchanged across life' },
    {
      symbol: 'lacZ',
      note: 'β-galactosidase — the blue of blue/white screens',
    },
    {
      symbol: 'lacI',
      note: 'Lac repressor — the first gene switch worked out',
    },
  ],
  224308: [
    { symbol: 'ftsZ', note: 'Cell-division ring — the bacterial tubulin' },
    { symbol: 'spo0A', note: 'Master regulator of sporulation' },
    { symbol: 'sigA', note: 'Housekeeping sigma factor' },
    { symbol: 'comK', note: 'Competence — the switch for DNA uptake' },
  ],
  83332: [
    {
      symbol: 'katG',
      note: 'Catalase-peroxidase — S315T, isoniazid resistance',
      focus: { residue: 315, residueLabel: 'S315' },
    },
    {
      symbol: 'rpoB',
      note: 'RNA polymerase β — S450L, rifampicin resistance',
      // UniProt's P9WGY9 starts six codons before the RefSeq protein the
      // literature counts from, so the map's Ser456 is the papers' S450
      focus: { residue: 456, residueLabel: 'S450L (Ser456)' },
    },
    { symbol: 'inhA', note: 'Enoyl-ACP reductase — what isoniazid inhibits' },
    { symbol: 'gyrA', note: 'DNA gyrase — fluoroquinolone resistance' },
    { symbol: 'embB', note: 'Arabinosyltransferase — ethambutol resistance' },
  ],
  4896: [
    {
      symbol: 'cdc2',
      note: 'The cell-cycle kinase, found here first — human CDK1',
    },
    { symbol: 'cdc25', note: 'Phosphatase that switches cdc2 on' },
    {
      symbol: 'wee1',
      note: 'Kinase that holds cdc2 off — mutants divide small',
    },
    { symbol: 'cdc13', note: 'B-type cyclin, the partner of cdc2' },
  ],
  237561: [
    {
      symbol: 'ERG11',
      note: 'Lanosterol 14α-demethylase — the azole target',
      focus: { residue: 132, residueLabel: 'Y132' },
    },
    { symbol: 'EFG1', note: 'Regulator of the yeast-to-hypha switch' },
    { symbol: 'TUP1', note: 'Corepressor — its loss locks cells as filaments' },
    { symbol: 'HWP1', note: 'Hyphal wall protein — adhesion to host cells' },
    { symbol: 'ALS3', note: 'Adhesin and invasin of the hyphal surface' },
  ],
  2697049: [
    {
      symbol: 'S',
      note: 'Spike — D614G, the first substitution to sweep the pandemic',
      focus: { residue: 614, residueLabel: 'D614' },
    },
    { symbol: 'N', note: 'Nucleocapsid — packages the RNA genome' },
    { symbol: 'M', note: 'Membrane protein — shapes the virion' },
    { symbol: 'E', note: 'Envelope protein — a 75-residue ion channel' },
    { symbol: 'ORF3a', note: 'Accessory ion channel' },
  ],
  11676: [
    {
      symbol: 'gag',
      note: 'Gag polyprotein — matrix, capsid and nucleocapsid',
    },
    { symbol: 'env', note: 'Envelope gp160 — the entry machine' },
    { symbol: 'nef', note: 'Downregulates CD4 and MHC-I' },
    { symbol: 'vif', note: 'Counters the APOBEC3G restriction factor' },
    { symbol: 'tat', note: 'Transactivator, encoded across two exons' },
    { symbol: 'vpr', note: 'Arrests the cell cycle of the infected cell' },
  ],
}

// A species with no curated list gets none: another species' symbols would
// mean nothing there, and a chip's residue preset would light the wrong one.
export function examplesFor(taxId: number): ProteinExample[] {
  return EXAMPLES_BY_TAXON[taxId] ?? []
}
