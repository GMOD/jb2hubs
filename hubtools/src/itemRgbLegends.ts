// UCSC bigBeds whose itemRgb colors a key can name, with no filterValues.itemRgb
// in trackDb to name them. ucsc2jbrowse/src/measureItemRgbPalettes.ts found
// each color to follow one column, a category or a numeric range, over up to
// 15,000 features of each track's file (2026-10-14); the labels name that
// column's values. The track keeps painting its own itemRgb, so a value the
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
