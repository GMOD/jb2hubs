// Curated example genes per reference species. A chip that errors is worse than
// no chip, so every symbol here was checked against NCBI Datasets' symbol
// endpoint for its taxon on 2026-08-26 — it resolves to a gene with a placed
// locus — and the human picks were checked against the 100-way name index too,
// so the alignment-source choice has both arms for all of them.
//
// The picks are textbook genes for each organism rather than a random sample:
// the point of a chip is that someone who does not have a gene in mind still
// sees the tool do something recognisable.

import { type Edit, EDITS } from './editConsequence.ts'

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
  // what the session opens on at the residue: the residues a stop there
  // removes, or the residues skipping its exon deletes
  edit?: Edit
  pfam?: string
  // first residue of the repeat meant, where the family occurs more than once
  start?: number
  // UniProt accession of the partner, as PDBe names it
  partner?: string
  // PDB chemical component id naming a ligand site, as the map names it
  ligand?: string
}

const FOCUS_PARAMS = [
  'residue',
  'label',
  'edit',
  'pfam',
  'at',
  'partner',
  'ligand',
]

// The focus as search params, so a focused page is a link: `residue=7&label=E6V
// (Glu7)`, `pfam=PF00008&at=1000`, `partner=Q13233`.
export function focusToParams(
  focus: ExampleFocus | undefined,
  params: URLSearchParams,
) {
  for (const k of FOCUS_PARAMS) {
    params.delete(k)
  }
  if (focus?.residue) {
    params.set('residue', String(focus.residue))
    if (focus.residueLabel) {
      params.set('label', focus.residueLabel)
    }
    if (focus.edit) {
      params.set('edit', focus.edit)
    }
  } else if (focus?.pfam) {
    params.set('pfam', focus.pfam)
    if (focus.start) {
      params.set('at', String(focus.start))
    }
  } else if (focus?.partner) {
    params.set('partner', focus.partner)
  } else if (focus?.ligand) {
    params.set('ligand', focus.ligand)
  }
}

const MAX_LABEL = 60

export function focusFromParams(
  params: URLSearchParams,
): ExampleFocus | undefined {
  const residue = Number(params.get('residue'))
  if (Number.isInteger(residue) && residue > 0) {
    const label = params.get('label')?.trim().slice(0, MAX_LABEL)
    const edit = EDITS.find(e => e === params.get('edit'))
    return {
      residue,
      ...(label ? { residueLabel: label } : {}),
      ...(edit ? { edit } : {}),
    }
  }
  const pfam = params.get('pfam')
  if (pfam && /^PF\d{5}$/.test(pfam)) {
    const start = Number(params.get('at'))
    return Number.isInteger(start) && start > 0 ? { pfam, start } : { pfam }
  }
  const partner = params.get('partner')
  if (partner && /^[\w-]+$/.test(partner)) {
    return { partner }
  }
  const ligand = params.get('ligand')
  return ligand && /^\w+$/.test(ligand) ? { ligand } : undefined
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
      focus: { residue: 248, residueLabel: 'Cancer hotspot R248' },
      structure: '3kmd',
    },
    {
      symbol: 'BRAF',
      note: 'Kinase — V600E, the melanoma driver, in the activation segment',
      focus: { residue: 600, residueLabel: 'Melanoma variant V600E' },
      structure: '1uwh',
    },
    {
      symbol: 'HBB',
      note: 'β-globin — E6V, sickle cell, and the α/β interface it does not touch',
      focus: { residue: 7, residueLabel: 'Sickle variant E6V (residue 7)' },
      structure: '2hbs',
    },
    {
      symbol: 'NOTCH1',
      note: 'EGF-repeat array — EGF12, where Delta and Jagged bind',
      // EGF12's O-fucosylated T466 contacts the ligand (Luca et al. 2015,
      // Science 347:847, doi:10.1126/science.1261093; Taylor et al. 2014,
      // PNAS 111:7290, doi:10.1073/pnas.1319683111)
      focus: { pfam: 'PF00008', start: 452 },
    },
  ],
  10090: [
    {
      symbol: 'Trp53',
      note: 'p53 tumour suppressor — the mouse orthologue',
      focus: { residue: 245, residueLabel: 'Cancer hotspot R245 (human R248)' },
      structure: '3exj',
    },
    {
      symbol: 'Shh',
      note: 'Sonic hedgehog — limb and neural patterning',
      focus: { residue: 183, residueLabel: 'Zinc-site residue H183' },
      structure: '2wfx',
    },
    {
      symbol: 'Brca1',
      note: 'Breast-cancer susceptibility gene',
      focus: {
        residue: 1363,
        residueLabel: 'PALB2-contact residue L1363 (human L1407)',
      },
      structure: '7k3s',
    },
    {
      symbol: 'Mecp2',
      note: 'Rett syndrome — X-linked chromatin regulator',
      focus: { residue: 306, residueLabel: 'Rett variant R306C' },
      structure: '5naf',
    },
    {
      symbol: 'Pax6',
      note: 'Master eye-development transcription factor',
      focus: { residue: 259, residueLabel: 'Pax6(4Neu) variant S259P' },
    },
    {
      symbol: 'Cftr',
      note: 'Cystic fibrosis chloride channel',
      focus: {
        residue: 508,
        residueLabel: 'Cystic fibrosis site F508 (ΔF508)',
      },
    },
  ],
  10116: [
    {
      symbol: 'Tp53',
      note: 'p53 tumour suppressor',
      focus: { residue: 246, residueLabel: 'Cancer hotspot R246 (human R248)' },
    },
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
    {
      symbol: 'tp53',
      note: 'p53 tumour suppressor',
      focus: {
        residue: 214,
        residueLabel: 'Tumour-prone mutant M214K (human M246)',
      },
    },
    { symbol: 'pax6a', note: 'Eye-development transcription factor' },
    { symbol: 'myca', note: 'MYC proto-oncogene a' },
    { symbol: 'sox2', note: 'Stem-cell / neural transcription factor' },
  ],
  9031: [
    {
      symbol: 'TP53',
      note: 'p53 tumour suppressor',
      focus: { residue: 234, residueLabel: 'Cancer hotspot R234 (human R248)' },
    },
    { symbol: 'SHH', note: 'Sonic hedgehog — limb bud patterning' },
    { symbol: 'PAX6', note: 'Eye-development transcription factor' },
    { symbol: 'BMP4', note: 'Beak morphology and skeletal patterning' },
    {
      symbol: 'MYC',
      note: 'MYC proto-oncogene',
      focus: {
        residue: 80,
        residueLabel: 'MC29 v-Myc variant T61M (residue 80)',
      },
    },
  ],
  9615: [
    {
      symbol: 'TP53',
      note: 'p53 tumour suppressor',
      focus: { residue: 236, residueLabel: 'Cancer hotspot R236 (human R248)' },
    },
    {
      symbol: 'MC1R',
      note: 'Coat-colour receptor — a classic breed locus',
      focus: {
        residue: 306,
        residueLabel: 'Recessive-yellow variant R306* (e allele)',
      },
    },
    { symbol: 'BRCA1', note: 'Breast-cancer susceptibility gene' },
    { symbol: 'EGFR', note: 'Receptor tyrosine kinase' },
    {
      symbol: 'SOD1',
      note: 'Degenerative myelopathy — the canine ALS model',
      focus: {
        residue: 40,
        residueLabel: 'Degenerative myelopathy variant E40K',
      },
      structure: '7wx0',
    },
  ],
  9913: [
    {
      symbol: 'DGAT1',
      note: 'Milk-fat QTL — the textbook cattle variant',
      focus: { residue: 232, residueLabel: 'Milk-fat variant K232A' },
    },
    {
      symbol: 'MSTN',
      note: 'Myostatin — double-muscling in Belgian Blue',
      focus: {
        residue: 313,
        residueLabel: 'Piedmontese double-muscling variant C313Y',
      },
    },
    {
      symbol: 'CSN2',
      note: 'β-casein — the A1/A2 milk protein',
      focus: {
        residue: 82,
        residueLabel: 'P67H, the A1/A2 switch (residue 82)',
      },
    },
    { symbol: 'LEP', note: 'Leptin — feed intake and carcass fat' },
    {
      symbol: 'TP53',
      note: 'p53 tumour suppressor',
      focus: { residue: 241, residueLabel: 'Cancer hotspot R241 (human R248)' },
    },
  ],
  9823: [
    { symbol: 'MSTN', note: 'Myostatin — muscle-mass regulator' },
    {
      symbol: 'RYR1',
      note: 'Ryanodine receptor — porcine stress syndrome',
      focus: { residue: 615, residueLabel: 'Halothane-stress variant R615C' },
      structure: '9pwo',
    },
    { symbol: 'IGF2', note: 'Imprinted growth factor — a muscle-mass QTL' },
    { symbol: 'LEP', note: 'Leptin — fat deposition' },
    {
      symbol: 'TP53',
      note: 'p53 tumour suppressor',
      focus: {
        residue: 167,
        residueLabel: 'Oncopig variant R167H (human R175H)',
      },
    },
  ],
  8364: [
    { symbol: 'shh', note: 'Sonic hedgehog — the classic morphogen' },
    { symbol: 'pax6', note: 'Eye-development transcription factor' },
    {
      symbol: 'tp53',
      note: 'p53 tumour suppressor',
      focus: { residue: 223, residueLabel: 'Cancer hotspot R223 (human R248)' },
    },
    { symbol: 'sox2', note: 'Neural / stem-cell transcription factor' },
    { symbol: 'myc', note: 'MYC proto-oncogene' },
  ],
  7227: [
    {
      symbol: 'Antp',
      note: 'Antennapedia — Hox homeotic gene',
      focus: { residue: 346, residueLabel: 'Homeodomain Q50 (residue 346)' },
      structure: '9ant',
    },
    {
      symbol: 'Ubx',
      note: 'Ultrabithorax — Hox gene',
      focus: { residue: 242, residueLabel: 'Exd-binding YPWM tryptophan W242' },
      structure: '1b8i',
    },
    {
      symbol: 'wg',
      note: 'wingless — the founding Wnt ligand',
      focus: { residue: 239, residueLabel: 'Palmitoleoylated serine S239' },
    },
    {
      symbol: 'N',
      note: 'Notch — receptor of the Notch pathway',
      focus: {
        residue: 502,
        residueLabel: 'Fringe-target O-fucose site S502 (EGF12)',
      },
      structure: '7alj',
    },
    { symbol: 'dpp', note: 'decapentaplegic — a BMP morphogen' },
    { symbol: 'w', note: 'white — the classic eye-colour gene' },
  ],
  6239: [
    {
      symbol: 'lin-12',
      note: 'Notch-family receptor — cell-fate decisions',
      focus: {
        residue: 945,
        residueLabel: 'LAG-1-gripping RAM tryptophan W945',
      },
      structure: '2fo1',
    },
    {
      symbol: 'daf-16',
      note: 'FOXO transcription factor — lifespan',
      focus: { residue: 273, residueLabel: 'AKT site T273 (T242 in DAF-16a)' },
    },
    {
      symbol: 'let-60',
      note: 'Ras orthologue — vulval induction',
      focus: { residue: 13, residueLabel: 'Multivulva allele G13E (n1046)' },
    },
    { symbol: 'unc-54', note: 'Muscle myosin heavy chain' },
  ],
  559292: [
    {
      symbol: 'CDC28',
      note: 'Cyclin-dependent kinase — the cell-cycle engine',
    },
    {
      symbol: 'ACT1',
      note: 'Actin — among the most conserved proteins known',
      focus: { residue: 157, residueLabel: 'Latrunculin-resistance site D157' },
      structure: '1yag',
    },
    {
      symbol: 'GAL4',
      note: 'The transcription activator two-hybrid is built on',
    },
    {
      symbol: 'HSP104',
      note: 'Disaggregase — prion propagation',
      focus: { residue: 184, residueLabel: 'Prion-curing guanidine site D184' },
      structure: '5vy9',
    },
    {
      symbol: 'TUB1',
      note: 'α-tubulin',
      focus: { residue: 255, residueLabel: 'GTPase-activating glutamate E255' },
      structure: '8qv2',
    },
  ],
  3702: [
    { symbol: 'AG', note: 'AGAMOUS — floral organ identity (MADS-box)' },
    {
      symbol: 'LFY',
      note: 'LEAFY — floral meristem identity',
      focus: { residue: 236, residueLabel: 'Leafy allele lfy-5 P236L' },
      structure: '2vy1',
    },
    { symbol: 'AP1', note: 'APETALA1 — floral organ identity' },
    {
      symbol: 'CO',
      note: 'CONSTANS — photoperiodic flowering',
      focus: { residue: 59, residueLabel: 'Late-flowering allele co-2 (R59H)' },
    },
    {
      symbol: 'PHYB',
      note: 'Phytochrome B — red-light photoreceptor',
      focus: { residue: 357, residueLabel: 'Bilin-attachment cysteine C357' },
      structure: '4our',
    },
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
    {
      symbol: 'ftsZ',
      note: 'Cell-division ring — the bacterial tubulin',
      focus: {
        residue: 105,
        residueLabel: 'Temperature-sensitive allele G105S (ftsZ84)',
      },
    },
    {
      symbol: 'gyrA',
      note: 'DNA gyrase — S83, where quinolone resistance arises',
      focus: { residue: 83, residueLabel: 'Quinolone-resistance site S83' },
    },
    {
      symbol: 'rpoB',
      note: 'RNA polymerase β — the rifampicin target',
      focus: { residue: 531, residueLabel: 'Rifampicin-resistance site S531' },
      structure: '6cux',
    },
    {
      symbol: 'dnaK',
      note: 'Hsp70 chaperone, nearly unchanged across life',
      focus: { residue: 199, residueLabel: 'Autophosphorylation site T199' },
      structure: '4b9q',
    },
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
    {
      symbol: 'ftsZ',
      note: 'Cell-division ring — the bacterial tubulin',
      focus: { residue: 187, residueLabel: 'GTP-binding site D187' },
      structure: '2rho',
    },
    {
      symbol: 'spo0A',
      note: 'Master regulator of sporulation',
      focus: { residue: 56, residueLabel: 'Phosphorylation site D56' },
    },
    {
      symbol: 'sigA',
      note: 'Housekeeping sigma factor',
      focus: { residue: 164, residueLabel: 'Polymerase-binding motif I164' },
      structure: '7ckq',
    },
    { symbol: 'comK', note: 'Competence — the switch for DNA uptake' },
  ],
  83332: [
    {
      symbol: 'katG',
      note: 'Catalase-peroxidase — S315T, isoniazid resistance',
      focus: {
        residue: 315,
        residueLabel: 'Isoniazid-resistance variant S315T',
      },
    },
    {
      symbol: 'rpoB',
      note: 'RNA polymerase β — S450L, rifampicin resistance',
      // UniProt's P9WGY9 starts six codons before the RefSeq protein the
      // literature counts from, so the map's Ser456 is the papers' S450
      focus: {
        residue: 456,
        residueLabel: 'Rifampicin-resistance variant S450L (residue 456)',
      },
    },
    {
      symbol: 'inhA',
      note: 'Enoyl-ACP reductase — what isoniazid inhibits',
      focus: { residue: 94, residueLabel: 'Isoniazid-resistance variant S94A' },
      structure: '4tro',
    },
    {
      symbol: 'gyrA',
      note: 'DNA gyrase — fluoroquinolone resistance',
      focus: {
        residue: 94,
        residueLabel: 'Fluoroquinolone-resistance variant D94G',
      },
      structure: '8s7o',
    },
    {
      symbol: 'embB',
      note: 'Arabinosyltransferase — ethambutol resistance',
      focus: {
        residue: 306,
        residueLabel: 'Ethambutol-resistance variant M306V',
      },
      structure: '7bvf',
    },
  ],
  4896: [
    {
      symbol: 'cdc2',
      note: 'The cell-cycle kinase, found here first — human CDK1',
    },
    {
      symbol: 'cdc25',
      note: 'Phosphatase that switches cdc2 on',
      focus: { residue: 480, residueLabel: 'Catalytic cysteine C480' },
    },
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
      focus: { residue: 132, residueLabel: 'Azole-resistance site Y132' },
    },
    {
      symbol: 'EFG1',
      note: 'Regulator of the yeast-to-hypha switch',
      focus: { residue: 208, residueLabel: 'PKA site T206 (residue 208)' },
    },
    { symbol: 'TUP1', note: 'Corepressor — its loss locks cells as filaments' },
    { symbol: 'HWP1', note: 'Hyphal wall protein — adhesion to host cells' },
    {
      symbol: 'ALS3',
      note: 'Adhesin and invasin of the hyphal surface',
      focus: {
        residue: 76,
        residueLabel: 'Peptide-binding cavity K59 (residue 76)',
      },
      structure: '4leb',
    },
  ],
  2697049: [
    {
      symbol: 'S',
      note: 'Spike — N501Y, in the ACE2-binding motif of Alpha and Omicron',
      // N501Y raises the receptor-binding domain's affinity for ACE2 (Starr
      // et al. 2020, Cell 182:1295, doi:10.1016/j.cell.2020.08.012). D614G,
      // the chip before, says nothing on the page: its story is a contact
      // between protomers, in a 22 MB partner list the page does not read.
      focus: { residue: 501, residueLabel: 'ACE2-binding variant N501Y' },
    },
    {
      symbol: 'N',
      note: 'Nucleocapsid — packages the RNA genome',
      focus: { residue: 107, residueLabel: 'RNA-binding residue R107' },
      structure: '7act',
    },
    { symbol: 'M', note: 'Membrane protein — shapes the virion' },
    {
      symbol: 'E',
      note: 'Envelope protein — a 75-residue ion channel',
      focus: { residue: 15, residueLabel: 'Ion-channel residue N15' },
      structure: '7k3g',
    },
    {
      symbol: 'ORF3a',
      note: 'Accessory ion channel',
      focus: { residue: 57, residueLabel: 'Common variant Q57H' },
      structure: '6xdc',
    },
  ],
  11676: [
    {
      symbol: 'gag',
      note: 'Gag polyprotein — matrix, capsid and nucleocapsid',
    },
    {
      symbol: 'env',
      note: 'Envelope gp160 — the entry machine',
      focus: { residue: 368, residueLabel: 'CD4-binding loop residue D368' },
      structure: '1gc1',
    },
    { symbol: 'nef', note: 'Downregulates CD4 and MHC-I' },
    {
      symbol: 'vif',
      note: 'Counters the APOBEC3G restriction factor',
      focus: { residue: 108, residueLabel: 'Zinc site H108 of the HCCH motif' },
      structure: '8cx0',
    },
    {
      symbol: 'tat',
      note: 'Transactivator, encoded across two exons',
      focus: { residue: 52, residueLabel: 'TAR-binding arginine R52' },
      structure: '6mce',
    },
    { symbol: 'vpr', note: 'Arrests the cell cycle of the infected cell' },
  ],
}

// A species with no curated list gets none: another species' symbols would
// mean nothing there, and a chip's residue preset would light the wrong one.
export function examplesFor(taxId: number): ProteinExample[] {
  return EXAMPLES_BY_TAXON[taxId] ?? []
}

// The chips the page opens with, across species: a showcase a reader should
// not have to pick a species to find. Each is one of its species' own chips,
// with the name the row tags it by.
const SHOWCASE: { taxId: number; symbol: string; species?: string }[] = [
  { taxId: 9606, symbol: 'TP53' },
  { taxId: 9606, symbol: 'HBB' },
  { taxId: 9606, symbol: 'NOTCH1' },
  { taxId: 83332, symbol: 'rpoB', species: 'TB' },
  { taxId: 2697049, symbol: 'S', species: 'SARS-CoV-2' },
  { taxId: 6239, symbol: 'let-60', species: 'worm' },
  { taxId: 9913, symbol: 'CSN2', species: 'cattle' },
  { taxId: 3702, symbol: 'PHYB', species: 'Arabidopsis' },
]

export interface ShowcaseExample extends ProteinExample {
  taxId: number
  species?: string
}

export function showcaseExamples(): ShowcaseExample[] {
  return SHOWCASE.flatMap(({ taxId, symbol, species }) => {
    const example = examplesFor(taxId).find(e => e.symbol === symbol)
    return example ? [{ ...example, taxId, species }] : []
  })
}
