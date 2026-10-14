// UCSC bigBeds whose itemRgb colors a key can name, with no filterValues.itemRgb
// in trackDb to name them. ucsc2jbrowse/src/measureItemRgbPalettes.ts samples
// up to 15,000 features of each track's file (2026-10-14). Where each color
// follows one column, a category or a numeric range, the labels name that
// column's values; where no single column fixes it (knownGene, clinvarCnv,
// crispr, censat, ...), they follow the color key on the track's UCSC
// description page. The track keeps painting its own itemRgb, so a value the
// sample missed still draws in its file's color.

export interface ItemRgbLegend {
  title: string
  entries: readonly (readonly [rgb: string, label: string])[]
}

const TOGA_V1: ItemRgbLegend = {
  title: 'Gene loss classification',
  entries: [
    ['0,0,200', 'Intact'],
    ['0,200,255', 'Partially intact'],
    ['255,160,120', 'Uncertain loss'],
    ['255,50,50', 'Lost'],
    ['130,130,130', 'Missing or partially missing'],
    ['159,129,112', 'Paralogous projection'],
  ],
}

const TOGA_V2: ItemRgbLegend = {
  title: 'Gene loss classification',
  entries: [
    ['0,0,100', 'Fully intact'],
    ['0,0,200', 'Intact'],
    ['0,200,255', 'Partially intact'],
    ['255,160,120', 'Uncertain loss'],
    ['255,50,50', 'Lost'],
    ['130,130,130', 'Missing'],
    ['159,129,112', 'Paralogous projection'],
  ],
}

const LOEUF: ItemRgbLegend = {
  title: 'LOEUF',
  entries: [
    ['244,0,2', '< 0.1'],
    ['240,74,3', '0.1 – 0.2'],
    ['233,127,5', '0.2 – 0.3'],
    ['224,165,8', '0.3 – 0.4'],
    ['210,191,13', '0.4 – 0.5'],
    ['191,210,22', '0.5 – 0.6'],
    ['165,224,26', '0.6 – 0.7'],
    ['127,233,58', '0.7 – 0.8'],
    ['74,240,94', '0.8 – 0.9'],
    ['0,244,153', '≥ 0.9'],
  ],
}

const HETEROZYGOSITY: ItemRgbLegend = {
  title: 'Expected heterozygosity',
  entries: [
    ['0,0,180', '< 0.1'],
    ['70,130,230', '0.1 – 0.3'],
    ['180,130,200', '0.3 – 0.5'],
    ['230,100,80', '0.5 – 0.7'],
    ['180,0,0', '≥ 0.7'],
    ['128,128,128', 'No estimate'],
  ],
}

const GNOMAD_ANNOTATION: ItemRgbLegend = {
  title: 'Annotation',
  entries: [
    ['255,32,0', 'pLoF'],
    ['247,189,0', 'Missense'],
    ['4,255,0', 'Synonymous'],
    ['95,95,95', 'Other'],
  ],
}

const PANELAPP_AUS_CONFIDENCE: ItemRgbLegend = {
  title: 'PanelApp Australia confidence',
  entries: [
    ['0,255,0', 'Green (high evidence)'],
    ['255,191,0', 'Amber (moderate evidence)'],
    ['255,0,0', 'Red (low evidence)'],
  ],
}

const SGDP_COPY_NUMBER: ItemRgbLegend = {
  title: 'Copy number',
  entries: [
    ['229,229,229', '0'],
    ['196,196,196', '1'],
    ['0,0,0', '2'],
    ['0,0,205', '3'],
    ['65,105,225', '4'],
    ['100,149,237', '5'],
    ['180,238,180', '6'],
    ['255,255,0', '7'],
    ['255,165,0', '8'],
    ['139,26,26', '9'],
    ['255,0,0', '10 – 19'],
    ['0,255,255', '20 – 29'],
    ['32,178,170', '30 – 39'],
    ['0,255,0', '40 – 49'],
    ['34,139,34', '50 – 59'],
    ['0,100,0', '60 – 69'],
    ['75,0,130', '70 – 79'],
    ['139,0,139', '80 – 89'],
    ['148,0,211', '90 – 99'],
    ['199,21,133', '100 – 109'],
    ['255,105,180', '110 – 119'],
    ['255,192,203', '≥ 120'],
  ],
}

const CRISPR: ItemRgbLegend = {
  title: 'Guide specificity and efficiency',
  entries: [
    ['0,200,0', 'High predicted cleavage'],
    ['255,255,0', 'Medium predicted cleavage'],
    ['255,100,100', 'Low predicted cleavage'],
    ['80,80,80', 'Low specificity (MIT ≤ 50)'],
    ['150,150,150', 'Not unique in the genome'],
  ],
}

const MISSENSE_Z: ItemRgbLegend = {
  title: 'Missense constraint',
  entries: [
    ['244,0,2', 'Z-score > 3.09'],
    ['0,0,0', 'Z-score ≤ 3.09'],
  ],
}

const GTEX_TISSUE: ItemRgbLegend = {
  title: 'Tissue',
  entries: [
    ['143,188,143', 'Adrenal gland'],
    ['255,165,79', 'Adipose, subcutaneous'],
    ['238,154,0', 'Adipose, visceral omentum'],
    ['139,28,98', 'Artery, aorta'],
    ['238,106,80', 'Artery, coronary'],
    ['255,0,0', 'Artery, tibial'],
    ['238,238,0', 'Brain (13 regions)'],
    ['0,205,205', 'Breast'],
    ['238,130,238', 'EBV-transformed lymphocytes'],
    ['154,192,205', 'Cultured fibroblasts'],
    ['238,197,145', 'Colon, transverse'],
    ['139,115,85', 'Esophagus, mucosa and gastroesophageal junction'],
    ['205,170,125', 'Esophagus, muscularis'],
    ['180,82,205', 'Heart, atrial appendage'],
    ['122,55,139', 'Heart, left ventricle'],
    ['154,205,50', 'Lung'],
    ['122,103,238', 'Muscle, skeletal'],
    ['255,215,0', 'Nerve, tibial'],
    ['255,182,193', 'Ovary'],
    ['205,155,29', 'Pancreas'],
    ['180,238,180', 'Pituitary'],
    ['217,217,217', 'Prostate'],
    ['58,95,205', 'Skin, not sun exposed'],
    ['30,144,255', 'Skin, sun exposed'],
    [
      '205,183,158',
      'Spleen, sigmoid colon, small intestine, liver, minor salivary gland or kidney cortex',
    ],
    ['255,211,155', 'Stomach'],
    ['166,166,166', 'Testis'],
    ['0,139,69', 'Thyroid'],
    ['238,213,210', 'Uterus or vagina'],
    ['255,0,255', 'Whole blood'],
  ],
}

export const UCSC_ITEM_RGB_LEGENDS: Record<string, ItemRgbLegend> = {
  HLTOGAannotvGalGal6v1: TOGA_V1,
  HLTOGAannotvHg38v1: TOGA_V1,
  HLTOGAannotvsHLbosTau10v2: TOGA_V2,
  HLTOGAannotvsHLcorHaw3v2: TOGA_V2,
  HLTOGAannotvsHLdroNov3v2: TOGA_V2,
  HLTOGAannotvsHLeleMaxInd3Av2: TOGA_V2,
  HLTOGAannotvsHLgalGal7v2: TOGA_V2,
  HLTOGAannotvsHLrisTri2v2: TOGA_V2,
  HLTOGAannotvsHLtaeGut5v2: TOGA_V2,
  HLTOGAannotvsHg38v2: TOGA_V2,
  HLTOGAannotvsMm10v2: TOGA_V2,
  pliByGene: LOEUF,
  pliByTranscript: LOEUF,
  pliByTranscriptV4: LOEUF,
  pliByTranscriptV4_1: LOEUF,
  pliByTranscriptV4_1_1: LOEUF,
  trexplorer: HETEROZYGOSITY,
  viennaVntr: HETEROZYGOSITY,
  webstr: HETEROZYGOSITY,
  gnomadExomes: GNOMAD_ANNOTATION,
  gnomadExomesVariantsV4_1: GNOMAD_ANNOTATION,
  gnomadGenomes: GNOMAD_ANNOTATION,
  panelAppAusCNVs: PANELAPP_AUS_CONFIDENCE,
  panelAppAusTandRep: PANELAPP_AUS_CONFIDENCE,
  ensGene: {
    title: 'Transcript type',
    entries: [
      ['12,12,120', 'Protein coding'],
      ['0,153,0', 'Non-coding'],
      ['255,51,255', 'Pseudogene'],
    ],
  },
  catLiftOffGenesV1: {
    title: 'Transcript type',
    entries: [
      ['76,85,212', 'Protein coding'],
      ['85,212,76', 'Non-coding'],
      ['255,51,255', 'Pseudogene'],
      ['135,76,212', 'StringTie model'],
    ],
  },
  yale_parents: {
    title: 'Gene type',
    entries: [
      ['128,0,128', 'Parent gene'],
      ['192,192,192', 'Pseudogene'],
    ],
  },
  yale_pseudogenes: {
    title: 'Pseudogene type',
    entries: [
      ['85,107,47', 'Processed'],
      ['0,0,255', 'Unprocessed'],
      ['255,140,0', 'Unspecified'],
    ],
  },
  cls_gene_models: {
    title: 'GENCODE biotype',
    entries: [
      ['12,12,120', 'Protein coding'],
      ['0,100,0', 'lncRNA'],
      ['255,160,122', 'No GENCODE biotype'],
    ],
  },
  abSplice: {
    title: 'AbSplice score',
    entries: [
      ['0,0,255', '< 0.05'],
      ['255,128,0', '0.05 – 0.2'],
      ['255,0,0', '≥ 0.2'],
    ],
  },
  gnomadMpcOverlaps: {
    title: 'Max MPC, scaled 0 – 1000',
    entries: [
      ['200,200,200', '< 166'],
      ['255,200,100', '166 – 331'],
      ['255,150,50', '332 – 497'],
      ['200,0,0', '≥ 498'],
    ],
  },
  interactions: {
    title: 'Score',
    entries: [
      ['173,216,230', '1 – 10'],
      ['0,0,128', '11 – 100'],
      ['0,0,0', '101 – 1000'],
    ],
  },
  pHaplo: {
    title: 'pHaplo',
    entries: [
      ['181,2,14', '≥ 0.86'],
      ['250,42,27', '< 0.86'],
    ],
  },
  pTriplo: {
    title: 'pTriplo',
    entries: [
      ['0,9,138', '≥ 0.94'],
      ['87,92,252', '< 0.94'],
    ],
  },
  tommoStr: {
    title: 'Score',
    entries: [
      ['0,0,180', '< 100'],
      ['70,130,230', '100 – 299'],
      ['180,130,200', '300 – 499'],
      ['230,100,80', '500 – 699'],
      ['180,0,0', '≥ 700'],
    ],
  },
  clinvarLift: {
    title: 'Clinical significance',
    entries: [
      ['210,0,0', 'Pathogenic, likely pathogenic or conflicting'],
      ['0,210,0', 'Benign or likely benign'],
      ['128,128,128', 'Uncertain significance or other'],
    ],
  },
  giabSv: {
    title: 'SV type',
    entries: [
      ['255,0,0', 'Deletion or delins'],
      ['0,0,255', 'Insertion'],
      ['128,128,128', 'Copy number variation'],
    ],
  },
  gire2014SpecificSnps: {
    title: 'Variant type',
    entries: [
      ['220,0,0', 'Nonsynonymous'],
      ['0,220,0', 'Synonymous'],
      ['0,0,0', 'Noncoding'],
    ],
  },
  mane: {
    title: 'MANE status',
    entries: [
      ['8,81,156', 'MANE Select'],
      ['222,45,38', 'MANE Plus Clinical'],
    ],
  },
  refSeqFuncElems: {
    title: 'Sequence ontology term',
    entries: [
      ['0,128,128', 'Regulatory region, enhancer, promoter or insulator'],
      ['192,0,0', 'Protein binding site'],
      ['160,82,45', 'Recombination feature'],
      ['0,0,192', 'Mobile genetic element or repeat region'],
      ['192,0,192', 'Sequence feature'],
      ['0,0,0', 'Origin of replication or stem loop'],
    ],
  },
  snpediaAll: {
    title: 'Genotyping arrays',
    entries: [
      ['200,200,200', 'dbSNP only'],
      ['0,0,100', 'Illumina'],
      ['100,0,255', 'Affymetrix'],
      ['0,0,0', 'Both'],
    ],
  },
  spliceVarDb: {
    title: 'SpliceVarDB classification',
    entries: [
      ['219,61,61', 'Splice-altering'],
      ['128,82,160', 'Low-frequency splice-altering'],
      ['57,135,204', 'Normal'],
      ['140,140,140', 'Conflicting'],
    ],
  },
  spStruct: {
    title: 'Annotation type',
    entries: [
      ['0,0,0', 'Strand, helix, turn or coiled coil'],
      ['0,100,100', 'Glycosylation site'],
      ['100,100,100', 'Disulfide bond'],
    ],
  },
  crisprHs1: CRISPR,
  crispr10KTargets: CRISPR,
  crisprTargets: CRISPR,
  missenseByGene: MISSENSE_Z,
  missenseByTranscript: MISSENSE_Z,
  gtexEqtlCaviar: GTEX_TISSUE,
  gtexEqtlDapg: GTEX_TISSUE,
  knownGene: {
    title: 'Transcript type',
    entries: [
      ['12,109,173', 'MANE Select or Plus Clinical'],
      ['12,12,120', 'Protein coding'],
      ['0,100,0', 'Non-coding'],
      ['254,0,0', 'Retained intron or TEC'],
      ['255,51,255', 'Pseudogene'],
    ],
  },
  clinvarCnv: {
    title: 'Variant type and significance',
    entries: [
      ['153,0,0', 'Loss, pathogenic'],
      ['255,0,0', 'Loss, uncertain'],
      ['255,98,119', 'Loss, benign'],
      ['0,0,179', 'Gain, pathogenic'],
      ['0,0,225', 'Gain, uncertain'],
      ['77,184,255', 'Gain, benign'],
      ['199,114,3', 'Indel, pathogenic'],
      ['225,165,0', 'Indel, uncertain'],
      ['250,214,69', 'Indel, benign'],
      ['128,0,128', 'Inversion, pathogenic'],
      ['192,0,192', 'Inversion, uncertain'],
      ['0,102,102', 'Microsatellite, pathogenic'],
      ['0,179,179', 'Microsatellite, uncertain'],
      ['0,255,255', 'Microsatellite, benign'],
      ['0,128,0', 'Complex, pathogenic'],
      ['0,210,0', 'Complex or translocation, uncertain'],
      ['128,128,128', 'Other'],
    ],
  },
  censat: {
    title: 'Satellite class',
    entries: [
      ['250,0,0', 'Active αSat HOR'],
      ['255,146,0', 'Inactive αSat HOR'],
      ['153,0,0', 'Divergent αSat HOR'],
      ['255,204,153', 'Monomeric αSat'],
      ['145,255,0', 'HSat1A'],
      ['0,153,76', 'HSat1B'],
      ['0,128,250', 'HSat2'],
      ['0,0,250', 'HSat3'],
      ['250,153,255', 'βSat'],
      ['172,51,199', 'γSat'],
      ['0,204,204', 'Other centromeric satellite'],
      ['224,224,224', 'Centromeric transition'],
      ['0,0,0', 'rDNA'],
    ],
  },
  ncbiRefSeqGenomicDiff: {
    title: 'Difference',
    entries: [
      ['255,0,0', 'Mismatch'],
      ['255,165,0', 'Short or shifted gap'],
      ['136,136,136', 'Double gap'],
      ['128,0,128', 'Skipped transcript sequence'],
    ],
  },
  mtrBed: {
    title: 'MTR percentile',
    entries: [
      ['255,0,0', '< 25'],
      ['0,0,0', '25 – 75'],
      ['0,128,0', '> 75'],
      ['0,0,255', 'No score'],
    ],
  },
  decipherHaploIns: {
    title: 'Haploinsufficiency prediction',
    entries: [
      ['255,0,255', 'Decile 10 (most likely)'],
      ['200,55,200', 'Decile 9'],
      ['175,80,175', 'Decile 8'],
      ['150,105,150', 'Decile 7'],
      ['125,130,125', 'Decile 6'],
      ['100,155,100', 'Decile 5'],
      ['75,180,75', 'Decile 4'],
      ['50,205,50', 'Decile 3'],
      ['25,230,25', 'Decile 2'],
      ['0,255,0', 'Decile 1 (least likely)'],
    ],
  },
  targetScanMiRnaSitesV72: {
    title: 'Site type',
    entries: [
      ['128,0,128', '8mer'],
      ['255,0,0', '7mer-m8'],
      ['30,144,255', '7mer-A1'],
      ['0,255,0', 'Non-canonical'],
    ],
  },
  vistaEnhancersBb: {
    title: 'In vivo enhancer activity',
    entries: [
      ['34,96,242', 'Positive'],
      ['100,100,100', 'Negative'],
    ],
  },
  mprabase: {
    title: 'Activity percentile within experiment',
    entries: [
      ['255,0,0', '≥ 75'],
      ['255,165,0', '50 – 74'],
      ['0,0,255', '< 50'],
    ],
  },
  mpraVarDb: {
    title: 'Significance',
    entries: [
      ['200,0,0', 'FDR < 0.05'],
      ['255,165,0', 'p < 0.05, FDR ≥ 0.05'],
      ['190,190,190', 'Not significant'],
    ],
  },
  gnomadStr: {
    title: 'Motif length',
    entries: [
      ['0,0,255', 'Dinucleotide'],
      ['0,128,0', 'Trinucleotide'],
      ['255,165,0', 'Tetranucleotide'],
      ['128,0,128', 'Pentanucleotide'],
      ['70,130,180', 'Hexanucleotide'],
      ['128,128,128', 'Longer or complex'],
    ],
  },
  catV2: {
    title: 'Transcript type',
    entries: [
      ['76,85,212', 'Protein coding'],
      ['85,212,76', 'Non-coding'],
      ['135,76,212', 'Novel prediction (AugustusCGP/PB)'],
    ],
  },
  unipAliSwissprot: {
    title: 'UniProt review status',
    entries: [
      ['12,12,120', 'Manually reviewed (Swiss-Prot)'],
      ['0,150,250', 'Unreviewed (TrEMBL)'],
    ],
  },
  unipCov2Modif: {
    title: 'Modification',
    entries: [
      ['0,100,100', 'Glycosylation site'],
      ['12,12,120', 'Lipid moiety-binding region'],
      ['200,200,0', 'Modified residue'],
    ],
  },
  spAnnot: {
    title: 'Annotation type',
    entries: [
      ['100,0,0', 'Topological domain'],
      ['0,0,100', 'Transmembrane region'],
      ['0,0,0', 'Other'],
    ],
  },
  spikeMuts: {
    title: 'First sequenced',
    entries: [
      ['0,0,255', 'Winter/spring 2020'],
      ['128,0,128', 'Summer 2020'],
      ['255,0,0', 'Fall/winter 2020–21'],
    ],
  },
  viralzoneGenes: {
    title: 'Expression stage',
    entries: [
      ['102,255,102', 'Early'],
      ['102,178,255', 'Intermediate'],
      ['255,51,51', 'Late'],
      ['255,255,255', 'Unknown'],
    ],
  },
}

// Per-sample families, one legend for every sample's track
const LEGEND_PREFIXES: readonly (readonly [string, ItemRgbLegend])[] = [
  ['sgdpCopyNumber_', SGDP_COPY_NUMBER],
]

export function ucscItemRgbLegend(track: string): ItemRgbLegend | undefined {
  return Object.hasOwn(UCSC_ITEM_RGB_LEGENDS, track)
    ? UCSC_ITEM_RGB_LEGENDS[track]
    : LEGEND_PREFIXES.find(([prefix]) => track.startsWith(prefix))?.[1]
}
