// The UCSC bigBeds whose itemRgb is a function of one column, with the color
// each value carries. Measured 2026-10-14 by pairing the column with itemRgb
// over up to 15,000 features per file: every value took exactly one color in
// every file sampled. A track joins only once its own file has been measured;
// the trackDb description is not evidence, since colorsDbSv's and genCC's
// disagree with their files.

export interface FieldPalette {
  field: string
  title: string
  values: readonly (readonly [value: string, rgb: string, label?: string])[]
}

const LONG_READ_SV: FieldPalette = {
  field: 'svType',
  title: 'SV type',
  values: [
    ['DEL', '200,0,0'],
    ['INS', '0,0,200'],
    ['DUP', '0,160,0'],
    ['INV', '230,140,0'],
    ['CPX', '140,0,200'],
    ['INSDEL', '100,100,150'],
    ['MIXED', '120,120,120'],
    ['BND', '90,90,90'],
    ['TRA', '90,90,90'],
  ],
}

const GNOMAD_SV_TYPES = [
  ['DEL', '255,0,0'],
  ['DUP', '0,0,255'],
  ['INS', '255,165,0'],
  ['INV', '192,0,192'],
  ['CPX', '0,179,179'],
] as const

const GNOMAD_SV_V2: FieldPalette = {
  field: 'svtype',
  title: 'SV type',
  values: [...GNOMAD_SV_TYPES, ['MCNV', '0,179,179'], ['BND', '128,128,128']],
}

// CTX names a color only in the palettes whose own files showed it.
const GNOMAD_SV_V2_SAMPLE_SUBSETS: FieldPalette = {
  ...GNOMAD_SV_V2,
  values: [...GNOMAD_SV_V2.values, ['CTX', '0,179,179']],
}

const GNOMAD_SV_V4: FieldPalette = {
  field: 'svtype',
  title: 'SV type',
  values: [...GNOMAD_SV_TYPES, ['CNV', '154,182,160'], ['BND', '128,128,128']],
}

const GNOMAD_CNV: FieldPalette = {
  field: 'svtype',
  title: 'SV type',
  values: GNOMAD_SV_TYPES.slice(0, 2),
}

const KOZAK_STRENGTH: FieldPalette = {
  field: 'kozakStrength',
  title: 'Kozak strength',
  values: [
    ['Strong', '245,166,35'],
    ['Moderate', '91,155,213'],
    ['Weak', '169,169,169'],
    ['non-ATG', '0,0,0'],
  ],
}

const PANELAPP_CONFIDENCE: FieldPalette = {
  field: 'confidenceLevel',
  title: 'PanelApp confidence',
  values: [
    ['3', '0,255,0', '3 (green): high evidence'],
    ['2', '255,191,0', '2 (amber): moderate evidence'],
    ['1', '255,0,0', '1 (red): not enough evidence'],
    ['0', '100,100,100', '0: not enough evidence'],
  ],
}

export const UCSC_FIELD_PALETTES: Record<string, FieldPalette> = {
  aou1kSv: LONG_READ_SV,
  aprSv: LONG_READ_SV,
  cardSv: LONG_READ_SV,
  chirmade101Sv: LONG_READ_SV,
  colorsDbSv: LONG_READ_SV,
  cpc1Sv: LONG_READ_SV,
  decodeSv: LONG_READ_SV,
  ga4kSv: LONG_READ_SV,
  gustafsonSv: LONG_READ_SV,
  han945Sv: LONG_READ_SV,
  hgsvc2Sv: LONG_READ_SV,
  hgsvc3Sv: LONG_READ_SV,
  hprc2v21Sv: LONG_READ_SV,
  lrSv1kgOnt: LONG_READ_SV,
  lrSv1kLin: LONG_READ_SV,
  lrSvAll: LONG_READ_SV,
  noyvertSv: LONG_READ_SV,
  tommoJpSv: LONG_READ_SV,
  gnomadCopyNumberVariants: GNOMAD_CNV,
  gnomadStructuralVariants: GNOMAD_SV_V4,
  gnomadSvControls: GNOMAD_SV_V2_SAMPLE_SUBSETS,
  gnomadSvFull: GNOMAD_SV_V2,
  gnomadSvNonneuro: GNOMAD_SV_V2_SAMPLE_SUBSETS,
  gencNcOrfsComprehensive: KOZAK_STRENGTH,
  gencNcOrfsPrimary: KOZAK_STRENGTH,
  metamorf: KOZAK_STRENGTH,
  nuorfdb: KOZAK_STRENGTH,
  openprot: KOZAK_STRENGTH,
  openprotMs: KOZAK_STRENGTH,
  utrAnnotUorfs: KOZAK_STRENGTH,
  panelAppCNVs: PANELAPP_CONFIDENCE,
  panelAppGenes: PANELAPP_CONFIDENCE,
  panelAppTandRep: PANELAPP_CONFIDENCE,
  clinvarMain: {
    field: '_clinSignCode',
    title: 'Clinical significance',
    values: [
      ['PG', '210,0,0', 'Pathogenic'],
      ['LP', '210,0,0', 'Likely pathogenic'],
      ['VUS', '0,0,128', 'Uncertain significance'],
      ['RF', '0,0,128', 'Risk factor'],
      ['CF', '137,121,212', 'Conflicting'],
      ['LB', '0,210,0', 'Likely benign'],
      ['BN', '0,210,0', 'Benign'],
      ['OT', '128,128,128', 'Other'],
    ],
  },
  clinGenGeneDisease: {
    field: 'Classification',
    title: 'ClinGen classification',
    values: [
      ['Definitive', '120,0,170'],
      ['Strong', '0,0,102'],
      ['Moderate', '0,0,255'],
      ['Limited', '153,153,255'],
      ['Disputed', '255,153,51'],
      ['Refuted', '255,51,51'],
      ['No Known Disease Relationship', '0,0,0'],
    ],
  },
  genCC: {
    field: 'classification_title',
    title: 'GenCC classification',
    values: [
      ['Definitive', '56,161,105'],
      ['Strong', '39,103,73'],
      ['Moderate', '104,211,145'],
      ['Supportive', '99,179,237'],
      ['Limited', '252,129,129'],
      ['Disputed Evidence', '229,62,62'],
      ['Refuted Evidence', '155,44,44'],
      ['No Known Disease Relationship', '113,128,150'],
    ],
  },
  strchive: {
    field: 'evidence',
    title: 'Evidence',
    values: [
      ['Definitive', '0,128,0'],
      ['Strong', '64,160,0'],
      ['Moderate', '0,0,200'],
      ['Limited', '230,145,0'],
      ['Provisional', '128,128,128'],
      ['Disputed', '200,0,0'],
      ['Refuted', '128,0,0'],
    ],
  },
  hgnc: {
    field: 'locus_group',
    title: 'Locus group',
    values: [
      ['protein-coding gene', '13,20,118'],
      ['non-coding RNA', '9,99,11'],
      ['pseudogene', '253,66,253'],
      ['other', '0,0,0'],
    ],
  },
}
