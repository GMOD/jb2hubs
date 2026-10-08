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

// How the precomputed panels (public/proteinExamples.json) are keyed. One rule,
// shared by the generator that writes the file and the page that reads it, so
// a chip for any species finds its entry however the symbol was typed.
export const cacheKey = (symbol: string, ref: number) =>
  `${symbol.trim().toUpperCase()}:${ref}`

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

export function sameExampleFocus(
  a: ExampleFocus | undefined,
  b: ExampleFocus | undefined,
) {
  return (
    !!a &&
    !!b &&
    a.residue === b.residue &&
    a.pfam === b.pfam &&
    a.start === b.start &&
    a.partner === b.partner
  )
}

// The chip a link came from, when its gene and focus are one of the chips',
// so the page shows the chip's story for it.
export function exampleMatching(
  taxId: number,
  symbol: string,
  focus: ExampleFocus | undefined,
) {
  return focus
    ? examplesFor(taxId).find(
        e =>
          e.symbol.toUpperCase() === symbol.toUpperCase() &&
          sameExampleFocus(e.focus, focus),
      )
    : undefined
}

export interface ProteinExample extends Example {
  focus?: ExampleFocus
  // one sentence on what there is to see once the session opens
  story?: string
}

const EXAMPLES_BY_TAXON: Record<number, ProteinExample[]> = {
  // The human picks are chosen on what the DOMAIN CARTOON shows at 60 species,
  // measured 2026-08-26 — a chip whose panel is one flat band teaches nothing,
  // however famous the gene. Each note says what there is to see.
  //
  // Deliberately dropped, with the reason, so they don't get re-added:
  //   CFTR — CDD annotates the whole protein as one "CFTR_protein" hit. One
  //          domain, no variation, a solid bar 60 times.
  //   HBB  — 18 orthologs in all of NCBI (globins are a paralog thicket), one
  //          domain, and 147 aa in every one of them.
  //   KRAS — small and near-invariant; SOD1 already covers "nothing changes"
  //          and does it in 150 aa.
  //   TTN  — CDD annotates titin one beta-strand at a time: 787 of the 1,040
  //          Region features on NP_001254479.2 are "Ig strand B [structural
  //          motif]" and friends, which is 59,632 blocks across a 60-species
  //          panel at a median 0.017% of the bar — sub-pixel, and the legend
  //          reads as an Ig strand census rather than an architecture.
  //          Measured 2026-08-27. There is no honest filter for it either:
  //          [structural motif] also tags NOTCH1's ANK repeats and DMD's
  //          EF-hands, and a width threshold that kills the strands kills
  //          titin's real Ig domains with them, because on a 35,000 aa protein
  //          they are the same size. Titin is still typeable; it is the
  //          cartoon it fails, and the chips are picked on the cartoon.
  // Four of the human chips also carry a focus, which is where the map's two
  // new sources earn their place: a residue everyone has heard of, opened in
  // the domain family that residue defines a position in, or in the complex
  // that gives the residue its meaning. Each was checked live on 2026-09-11.
  9606: [
    {
      symbol: 'TP53',
      note: 'Tumour suppressor — the TAD is missing in most fish, TAD2 is primate-only',
      focus: { residue: 248, residueLabel: 'R248' },
      story:
        'R248, among the most mutated residues in human cancer, sits in the DNA-binding domain and reaches into the DNA; the partner list opens that complex, and the HPV E6 one that marks p53 for degradation.',
    },
    {
      symbol: 'BRAF',
      note: 'Kinase — V600E, the melanoma driver, in the activation segment',
      focus: { residue: 600, residueLabel: 'V600' },
      story:
        'V600 is a kinase-domain position, and the MEK1 and 14-3-3 complexes in the partner list are why the mutation activates it.',
    },
    {
      symbol: 'HBB',
      note: 'β-globin — E6V, sickle cell, and the α/β interface it does not touch',
      focus: { residue: 7, residueLabel: 'E6V (Glu7)' },
      story:
        'E6V in the literature is Glu7 here, since mature haemoglobin is numbered without the initiator; the residue sits on the surface, outside the α/β interface, because sickling is a contact between tetramers.',
    },
    {
      symbol: 'BRCA2',
      note: 'BRC repeats, 4–15 copies — fish carry a shorter, tighter array',
    },
    {
      symbol: 'NOTCH1',
      note: 'EGF-repeat array, 13–30 copies; the richest architecture here',
      focus: { pfam: 'PF00008' },
      story:
        'One EGF repeat of thirty-six, read against the EGF seed: the six cysteines that pin the fold are the columns every row agrees on.',
    },
    {
      symbol: 'DMD',
      note: 'Dystrophin — spectrin repeats, 2–14 copies',
    },
    {
      symbol: 'EGFR',
      note: 'Identical 4-domain layout everywhere, so short bars are incomplete annotations',
    },
    {
      symbol: 'COL1A1',
      note: 'Collagen — glycine-rich repeats, 4–6 copies',
    },
    {
      symbol: 'PAX6',
      note: 'Homeodomain + paired box, unchanged across every vertebrate',
    },
    {
      symbol: 'SOD1',
      note: 'ALS — 150 aa and invariant: the control case',
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
      story:
        'S83 lines the pocket where a fluoroquinolone stacks against the cleaved DNA, and S83L is the commonest ciprofloxacin-resistance substitution in clinical E. coli.',
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
      story:
        'KatG activates the prodrug isoniazid, and S315T, the commonest resistance mutation worldwide, narrows the channel to the haem where that happens while leaving the enzyme working.',
    },
    {
      symbol: 'rpoB',
      note: 'RNA polymerase β — S450L, rifampicin resistance',
      // UniProt's P9WGY9 starts six codons before the RefSeq protein the
      // literature counts from, so the map's Ser456 is the papers' S450
      focus: { residue: 456, residueLabel: 'S450L (Ser456)' },
      story:
        'S450 in the literature is Ser456 on the UniProt sequence, which starts six residues earlier; it lines the rifampicin pocket beside the RNA exit path, and S450L accounts for most rifampicin-resistant tuberculosis.',
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
      story:
        'Y132 hydrogen-bonds the azole in the active site, and Y132F or Y132H is among the commonest causes of fluconazole resistance in Candida.',
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
      story:
        'D614 sits where one protomer of the trimer meets the next, away from the receptor-binding domain, and D614G replaced the original spike worldwide within months of 2020.',
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

// Human is the fallback: a species with no curated list still gets chips, and
// human symbols are the ones most readers can name.
export function examplesFor(taxId: number): ProteinExample[] {
  return EXAMPLES_BY_TAXON[taxId] ?? EXAMPLES_BY_TAXON[9606]!
}
