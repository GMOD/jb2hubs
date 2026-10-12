import assert from 'node:assert'
import { test } from 'node:test'

import {
  focusRanges,
  parseInterProRegions,
  parseInterfaceRegions,
  parseLigandSites,
  type PartnerOrigin,
  parseOrigins,
  parseResidue,
  parseResidueVariants,
  partnerAccessions,
  regionContaining,
  ligandName,
  kinaseLandmarks,
  residueContextText,
  residueFlag,
  residueRuns,
  residueVariantLines,
  parseLigandSynonyms,
  unnamedLigands,
  translationRanges,
} from './proteinFeatures.ts'

// The shape InterPro's entry/all/protein/uniprot answers with, pared down to
// what the parser reads. Modelled on TP53 (P04637), 2026-09-11.
const entry = (
  accession: string,
  source: string,
  type: string,
  name: string | null,
  integrated: string | null,
  ...ranges: [number, number][]
) => ({
  metadata: {
    accession,
    name: name ?? undefined,
    source_database: source,
    type,
    integrated,
  },
  proteins: [
    {
      entry_protein_locations: ranges.map(([start, end]) => ({
        fragments: [{ start, end }],
      })),
    },
  ],
})

const tp53Page = {
  count: 8,
  results: [
    entry(
      'IPR002117',
      'interpro',
      'family',
      'p53 tumour suppressor family',
      null,
      [3, 369],
    ),
    entry(
      'IPR008967',
      'interpro',
      'homologous_superfamily',
      'p53-like TF DNA-binding sf',
      null,
      [97, 287],
    ),
    entry(
      'IPR011615',
      'interpro',
      'domain',
      'p53, DNA-binding domain',
      null,
      [100, 288],
    ),
    entry(
      'IPR010991',
      'interpro',
      'domain',
      'p53, tetramerisation domain',
      null,
      [319, 357],
    ),
    entry(
      'IPR057064',
      'interpro',
      'conserved_site',
      'p53, central conserved site',
      null,
      [237, 249],
    ),
    entry(
      'PF00870',
      'pfam',
      'domain',
      'P53 DNA-binding domain',
      'IPR011615',
      [100, 288],
    ),
    entry(
      'PF07710',
      'pfam',
      'conserved_site',
      'P53 tetramerisation motif',
      'IPR010991',
      [319, 357],
    ),
    entry(
      'PTHR11447',
      'panther',
      'family',
      'CELLULAR TUMOR ANTIGEN P53',
      'IPR002117',
      [3, 369],
    ),
    entry(
      'cd08367',
      'cdd',
      'domain',
      'P53 DNA-binding domain',
      'IPR011615',
      [109, 288],
    ),
  ],
}

test('parseInterProRegions: InterPro domains and sites, with the Pfam under each', () => {
  const regions = parseInterProRegions([tp53Page])
  assert.deepStrictEqual(
    regions.map(r => [r.kind, r.accession, r.start, r.end, r.pfam]),
    [
      ['domain', 'IPR011615', 100, 288, 'PF00870'],
      ['site', 'IPR057064', 237, 249, undefined],
      ['domain', 'IPR010991', 319, 357, 'PF07710'],
    ],
  )
  assert.strictEqual(regions[0]!.name, 'p53, DNA-binding domain')
})

test('parseInterProRegions: one block per place, the Pfam entry kept', () => {
  const regions = parseInterProRegions([
    {
      results: [
        entry(
          'IPR000719',
          'interpro',
          'domain',
          'Protein kinase domain',
          null,
          [712, 979],
        ),
        entry(
          'IPR020635',
          'interpro',
          'domain',
          'Tyrosine kinase, catalytic',
          null,
          [712, 975],
        ),
        entry(
          'IPR001245',
          'interpro',
          'domain',
          'Ser-Thr/Tyr kinase, catalytic',
          null,
          [713, 965],
        ),
        entry(
          'PF07714',
          'pfam',
          'domain',
          'PK_Tyr_Ser-Thr',
          'IPR001245',
          [713, 965],
        ),
        entry(
          'IPR006211',
          'interpro',
          'domain',
          'Furin-like cysteine-rich',
          null,
          [177, 338],
        ),
        entry(
          'IPR017441',
          'interpro',
          'binding_site',
          'ATP-binding site',
          null,
          [718, 745],
        ),
      ],
    },
  ])
  assert.deepStrictEqual(
    regions.map(r => [r.accession, r.pfam]),
    [
      ['IPR006211', undefined],
      ['IPR001245', 'PF07714'],
      ['IPR017441', undefined],
    ],
  )
})

test('parseInterProRegions: family and superfamily entries are not regions', () => {
  const kinds = parseInterProRegions([tp53Page]).map(r => r.accession)
  assert.ok(!kinds.includes('IPR002117'))
  assert.ok(!kinds.includes('IPR008967'))
  assert.ok(!kinds.includes('PTHR11447'))
})

test('parseInterProRegions: an unintegrated Pfam entry stands on its own; other member DBs do not', () => {
  const regions = parseInterProRegions([
    {
      results: [
        entry('PF12345', 'pfam', 'domain', 'Orphan domain', null, [10, 60]),
        entry('cd00001', 'cdd', 'domain', 'Orphan CDD', null, [10, 60]),
        entry('SM00001', 'smart', 'domain', 'Orphan SMART', null, [10, 60]),
      ],
    },
  ])
  assert.deepStrictEqual(
    regions.map(r => [r.accession, r.pfam]),
    [['PF12345', 'PF12345']],
  )
})

test('parseInterProRegions: one region per fragment, across pages, sorted by start', () => {
  const regions = parseInterProRegions([
    {
      results: [
        entry(
          'IPR000742',
          'interpro',
          'domain',
          'EGF-like domain',
          null,
          [500, 530],
          [200, 230],
        ),
      ],
    },
    {
      results: [
        entry(
          'PF00008',
          'pfam',
          'domain',
          'EGF',
          'IPR000742',
          [200, 230],
          [500, 530],
        ),
        entry('IPR000001', 'interpro', 'repeat', 'Some repeat', null, [50, 80]),
      ],
    },
  ])
  assert.deepStrictEqual(
    regions.map(r => [r.kind, r.start, r.end, r.pfam]),
    [
      ['repeat', 50, 80, undefined],
      ['domain', 200, 230, 'PF00008'],
      ['domain', 500, 530, 'PF00008'],
    ],
  )
})

// The PDBe-KB interface_residues shape, on a p53 stand-in: MDM2 at the TAD,
// DNA over the core, an unnamed partner, and the protein against itself.
const interfaces = {
  P04637: {
    length: 393,
    data: [
      {
        name: 'DNA',
        accession: 'DNA',
        residues: [
          { startIndex: 120, endIndex: 120, allPDBEntries: ['1tup', '1tsr'] },
          {
            startIndex: 241,
            endIndex: 243,
            allPDBEntries: ['1tup', '1tsr', '2ac0'],
          },
          { startIndex: 248, endIndex: 248, allPDBEntries: ['1tup'] },
          { startIndex: 273, endIndex: 280, allPDBEntries: ['1tup', '2ac0'] },
        ],
      },
      {
        name: 'E3 ubiquitin-protein ligase Mdm2',
        accession: 'Q00987',
        residues: [
          { startIndex: 17, endIndex: 20, allPDBEntries: ['1ycr'] },
          { startIndex: 22, endIndex: 23, allPDBEntries: ['1ycr'] },
          { startIndex: 25, endIndex: 26, allPDBEntries: ['1ycr', '4hfz'] },
        ],
      },
      {
        name: 'Other',
        accession: 'Other',
        residues: [{ startIndex: 1, endIndex: 5, allPDBEntries: ['9xyz'] }],
      },
      {
        name: 'Maltose/maltodextrin-binding periplasmic protein',
        accession: 'P0AEX9',
        residues: [{ startIndex: 100, endIndex: 290, allPDBEntries: ['4xr8'] }],
      },
      {
        name: 'Cellular tumor antigen p53',
        accession: 'P04637',
        residues: [{ startIndex: 326, endIndex: 356, allPDBEntries: ['1c26'] }],
      },
    ],
  },
}

test('parseInterfaceRegions: one span per partner, most residues first, PDB entries by coverage', () => {
  const regions = parseInterfaceRegions(interfaces, 'P04637')
  assert.deepStrictEqual(
    regions.map(r => [r.name, r.start, r.end, r.residues!.length, r.pdbIds]),
    [
      ['itself (homo-oligomer)', 326, 356, 31, ['1c26']],
      ['DNA', 120, 280, 13, ['1tup', '1tsr', '2ac0']],
      ['E3 ubiquitin-protein ligase Mdm2', 17, 26, 8, ['1ycr', '4hfz']],
    ],
  )
  assert.deepStrictEqual(regions[2]!.residues, [17, 18, 19, 20, 22, 23, 25, 26])
})

test('parseInterfaceRegions: an unknown accession or a 404 body is no partners', () => {
  assert.deepStrictEqual(parseInterfaceRegions(interfaces, 'P00000'), [])
  assert.deepStrictEqual(parseInterfaceRegions(null, 'P04637'), [])
})

// TP53's ligand list as PDBe-KB answered on 2026-10-09, cut to its shapes:
// the zinc of the DNA-binding domain in hundreds of entries, two Y220C-pocket
// compounds crystallised once each, glycerol, sulfate the list does not flag
// as solvent, and NAD touching one lysine through a sirtuin it is bound to.
const contact = (residue: number, entries: string[]) => ({
  startIndex: residue,
  endIndex: residue,
  allPDBEntries: entries,
})
const ligandSites = {
  P04637: {
    data: [
      {
        accession: 'EXQ',
        name: 'carbazole EXQ',
        residues: [145, 147, 150, 220, 230].map(p => contact(p, ['5o1i'])),
      },
      {
        accession: 'ZN',
        name: 'ZINC ION',
        residues: [176, 179, 238, 242].map(p =>
          contact(p, ['2ocj', '3kmd', '1tsr']),
        ),
      },
      {
        accession: 'X0U',
        name: 'benzothiazole X0U',
        residues: [145, 147, 150, 157].map(p => contact(p, ['2x0u'])),
      },
      {
        accession: 'GOL',
        name: 'GLYCEROL',
        residues: [100, 101, 102].map(p => contact(p, ['2ocj'])),
        additionalData: { isSolvent: true },
      },
      {
        accession: 'SO4',
        name: 'SULFATE ION',
        residues: [248, 273, 280].map(p => contact(p, ['3kmd'])),
      },
      {
        accession: 'NAD',
        name: 'NAD',
        residues: [contact(382, ['2h4h'])],
      },
    ],
  },
}

test('parseLigandSites: additives and one-residue contacts out, a shared pocket one site', () => {
  const sites = parseLigandSites(ligandSites, 'P04637')
  assert.deepStrictEqual(
    sites.map(s => [s.name, s.accession, s.start, s.end, s.pdbIds]),
    [
      ['ZN', 'ZN', 176, 242, ['1tsr', '2ocj', '3kmd']],
      ['EXQ +1', 'EXQ', 145, 230, ['5o1i', '2x0u']],
    ],
  )
  assert.deepStrictEqual(sites[1]?.residues, [145, 147, 150, 157, 220, 230])
  assert.deepStrictEqual(parseLigandSites(null, 'P04637'), [])
})

test('residueRuns: merges across small gaps only', () => {
  assert.deepStrictEqual(residueRuns([17, 18, 19, 20, 22, 23, 25, 26, 40]), [
    { start: 17, end: 26 },
    { start: 40, end: 40 },
  ])
  assert.deepStrictEqual(residueRuns([1, 2, 6], 2), [
    { start: 1, end: 2 },
    { start: 6, end: 6 },
  ])
})

test('regionContaining: the narrowest domain holding the residue', () => {
  const regions = parseInterProRegions([tp53Page])
  assert.strictEqual(regionContaining(regions, 248)?.accession, 'IPR011615')
  assert.strictEqual(regionContaining(regions, 340)?.accession, 'IPR010991')
  assert.strictEqual(regionContaining(regions, 10), undefined)
})

// The first 12 residues of HBB (P68871): Glu7 is the sickle position, E6 in a
// numbering that skips the initiator methionine.
const hbb = 'MVHLTPEEKSAV'

test('parseResidue: a position, or a variant as papers write it', () => {
  assert.deepStrictEqual(parseResidue('7', hbb, 147), {
    position: 7,
    label: 'E7',
  })
  assert.deepStrictEqual(parseResidue('E7', hbb, 147), {
    position: 7,
    label: 'E7',
  })
  assert.deepStrictEqual(parseResidue(' p.E7V ', hbb, 147), {
    position: 7,
    label: 'E7V',
  })
  assert.deepStrictEqual(parseResidue('p.(Glu7Val)', hbb, 147), {
    position: 7,
    label: 'E7V',
  })
  assert.deepStrictEqual(parseResidue('e7v', hbb, 147), {
    position: 7,
    label: 'E7V',
  })
  assert.deepStrictEqual(parseResidue('K9*', hbb, 147), {
    position: 9,
    label: 'K9*',
  })
})

test('parseResidue: without a sequence the letter is taken on trust', () => {
  assert.deepStrictEqual(parseResidue('R248Q', undefined, 393), {
    position: 248,
    label: 'R248Q',
  })
  assert.deepStrictEqual(parseResidue('248', undefined, 393), {
    position: 248,
  })
})

test('parseResidue: a wrong wild-type letter says what is there', () => {
  const sickle = parseResidue('E6V', hbb, 147)
  assert.ok('error' in sickle)
  assert.match(sickle.error, /Residue 6 is P, not E\. Residue 7 is E/)
  const wrong = parseResidue('R3', hbb, 147)
  assert.ok('error' in wrong)
  assert.strictEqual(wrong.error, 'Residue 3 is H, not R.')
})

test('parseResidue: unreadable or out-of-range input is an error, not nothing', () => {
  for (const text of ['', 'p.', 'R248fs', 'Xyz12', '12B7', 'R-248']) {
    assert.ok('error' in parseResidue(text, hbb, 147), text)
  }
  const past = parseResidue('148', hbb, 147)
  assert.ok('error' in past)
  assert.match(past.error, /runs 1–147/)
  assert.ok('error' in parseResidue('0', hbb, 147))
})

test('focusRanges: an interface is its contact runs, not first to last', () => {
  assert.deepStrictEqual(
    focusRanges({
      kind: 'region',
      region: {
        kind: 'interface',
        name: 'MDM2',
        start: 17,
        end: 40,
        residues: [17, 18, 19, 20, 22, 23, 25, 26, 40],
      },
    }),
    [
      { start: 17, end: 26 },
      { start: 40, end: 40 },
    ],
  )
  assert.deepStrictEqual(
    focusRanges({
      kind: 'region',
      region: { kind: 'domain', name: 'P53', start: 95, end: 288 },
    }),
    [{ start: 95, end: 288 }],
  )
  assert.deepStrictEqual(focusRanges({ kind: 'residue', position: 248 }), [
    { start: 248, end: 248 },
  ])
})

// TP53's first 102 residues. Δ40p53 starts at Met40, so canonical residue n is
// its n − 39.
const tp53 =
  'MEEPQSDPSVEPPLSQETFSDLWKLLPENNVLSPLPSQAMDDLMLSPDDIEQWFTEDPGPDEAPRMPEAAPPVAPAPAAPTPAAPAPAPSWPLSSSVPSQKT'

test('translationRanges: the same sequence keeps its numbering', () => {
  const ranges = [{ start: 17, end: 26 }]
  assert.strictEqual(translationRanges(ranges, tp53, tp53), ranges)
})

test('translationRanges: an isoform missing the N-terminus renumbers, clips and drops', () => {
  const delta40 = tp53.slice(39)
  assert.deepStrictEqual(
    translationRanges(
      [
        { start: 45, end: 50 },
        { start: 30, end: 42 },
        { start: 1, end: 20 },
      ],
      tp53,
      delta40,
    ),
    [
      { start: 6, end: 11 },
      { start: 1, end: 3 },
    ],
  )
})

test('translationRanges: a skipped exon drops its residues and closes the gap', () => {
  const skipped = tp53.slice(0, 50) + tp53.slice(70)
  assert.deepStrictEqual(
    translationRanges([{ start: 45, end: 75 }], tp53, skipped),
    [{ start: 45, end: 55 }],
  )
  assert.deepStrictEqual(
    translationRanges([{ start: 55, end: 65 }], tp53, skipped),
    [],
  )
})

test('translationRanges: a mutually exclusive exon carries nothing, though it shares a stretch', () => {
  // the exon between residues 51 and 70 swapped for a paralogue sharing only
  // an 8-residue stretch, as PKM's exons 9 and 10 do
  const exon = tp53.slice(50, 70)
  const paralogue = 'WYHKCW' + exon.slice(6, 14) + 'YWHCKW'
  const swapped = tp53.slice(0, 50) + paralogue + tp53.slice(70)
  assert.deepStrictEqual(
    translationRanges([{ start: 45, end: 75 }], tp53, swapped),
    [
      { start: 45, end: 50 },
      { start: 71, end: 75 },
    ],
  )
})

test('translationRanges: a short shared start survives a long skip', () => {
  const skipped = tp53.slice(0, 20) + tp53.slice(60)
  assert.deepStrictEqual(
    translationRanges([{ start: 5, end: 25 }], tp53, skipped),
    [{ start: 5, end: 20 }],
  )
})

test('translationRanges: a short exon shared at the end carries, bounded by a gap', () => {
  // VEGFA's exon 8a: six residues after a skipped exon, then the end
  const canonical = tp53.slice(0, 60) + 'CDKPRR'
  const skipped = tp53.slice(0, 40) + 'CDKPRR'
  assert.deepStrictEqual(
    translationRanges([{ start: 61, end: 66 }], canonical, skipped),
    [{ start: 41, end: 46 }],
  )
})

test('translationRanges: a lone substitution between shared stretches carries', () => {
  const conflict = `${tp53.slice(0, 50)}W${tp53.slice(51)}`
  assert.deepStrictEqual(
    translationRanges([{ start: 51, end: 51 }], tp53, conflict),
    [{ start: 51, end: 51 }],
  )
})

// What the Proteins API answers for TP53 location=248, 2026-10-11, pared to
// the fields the parser reads and to some of the records: a neighbour at 247,
// two records for R248W, a frameshift, and the stop the API calls missense.
const variant = (
  begin: string,
  alt: string,
  consequenceType: string,
  significances: string[],
  extra: {
    note?: string
    evidences?: number
    association?: string[]
    wildType?: string
  } = {},
) => ({
  begin,
  end: begin,
  wildType: extra.wildType ?? 'R',
  alternativeSequence: alt,
  consequenceType,
  clinicalSignificances: significances.map(type => ({ type })),
  descriptions: extra.note
    ? [
        { value: 'Li-Fraumeni syndrome', sources: ['ClinVar'] },
        { value: extra.note, sources: ['UniProt'] },
      ]
    : [],
  evidences: Array.from({ length: extra.evidences ?? 0 }, () => ({})),
  association: (extra.association ?? []).map(name => ({ name })),
})
const LFS = 'LFS; germline mutation and in sporadic cancers; somatic mutation'
const tp53At248 = {
  features: [
    variant('247', 'S', 'missense', ['Pathogenic']),
    variant('248', 'C', 'missense', ['Variant of uncertain significance'], {
      note: 'a sporadic cancer; somatic mutation',
    }),
    variant('248', 'W', 'missense', ['Likely pathogenic'], {
      note: LFS,
      evidences: 7,
      association: [
        'Li-Fraumeni syndrome 1 (LFS)',
        'Li-Fraumeni syndrome (LFS)',
      ],
    }),
    variant('248', 'W', 'missense', ['Pathogenic']),
    variant('248', 'Q', 'missense', ['Pathogenic'], {
      note: LFS,
      evidences: 7,
    }),
    variant('248', 'G', 'missense', ['Pathogenic'], {
      note: 'sporadic cancers; somatic mutation',
    }),
    variant('248', 'P', 'frameshift', ['Pathogenic']),
    variant('248', '*', 'missense', []),
  ],
}

test('parseResidueVariants: only the position, substitutions, one entry per alternate', () => {
  assert.deepStrictEqual(parseResidueVariants(tp53At248, 248).substitutions, [
    { alt: 'G', class: 'pathogenic' },
    { alt: 'Q', class: 'pathogenic' },
    { alt: 'W', class: 'pathogenic' },
    { alt: 'C', class: 'uncertain' },
    { alt: '*', class: 'unclassified' },
  ])
})

test('parseResidueVariants: curator notes spelled out, shared, most-cited first', () => {
  assert.deepStrictEqual(parseResidueVariants(tp53At248, 248).notes, [
    {
      alts: ['Q', 'W'],
      text: 'Li-Fraumeni syndrome; germline mutation and in sporadic cancers; somatic mutation',
    },
    { alts: ['G'], text: 'sporadic cancers; somatic mutation' },
    { alts: ['C'], text: 'a sporadic cancer; somatic mutation' },
  ])
})

test('parseResidueVariants: records that disagree make a substitution uncertain', () => {
  const split = {
    features: [
      variant('7', 'V', 'missense', ['Benign']),
      variant('7', 'V', 'missense', ['Pathogenic']),
      variant('7', 'K', 'missense', [
        'Conflicting interpretations of pathogenicity',
      ]),
    ],
  }
  assert.deepStrictEqual(parseResidueVariants(split, 7).substitutions, [
    { alt: 'K', class: 'uncertain' },
    { alt: 'V', class: 'uncertain' },
  ])
})

test('parseResidueVariants: a stop gained counts, the strain list goes', () => {
  // E. coli gyrA S83 and HBB E7*, as UniProt words them
  const json = {
    features: [
      variant('83', 'L', 'missense', [], {
        wildType: 'S',
        note: 'NAL-51, NAL-112 and strains 58, 158; quinolone-resistant',
      }),
      variant('83', 'W', 'missense', [], {
        wildType: 'S',
        note: 'PPA-18 and strains 233 and 227; quinolone-resistant',
      }),
      variant('83', '*', 'stop gained', ['Pathogenic'], { wildType: 'S' }),
    ],
  }
  const v = parseResidueVariants(json, 83)
  assert.deepStrictEqual(v.notes, [
    { alts: ['L', 'W'], text: 'quinolone-resistant' },
  ])
  assert.strictEqual(v.substitutions[0]?.alt, '*')
})

test('parseResidueVariants: a long note keeps what the substitution does, other cancers last', () => {
  const braf =
    'CRC; also found in sarcoma, metastatic melanoma, ovarian serous carcinoma, pilocytic astrocytoma; somatic mutation; most common mutation; constitutive and elevated kinase activity; efficiently induces cell transformation; suppression of mutation in melanoma causes growth arrest and promotes apoptosis'
  const json = {
    features: [
      variant('600', 'E', 'missense', ['Pathogenic'], {
        wildType: 'V',
        note: braf,
        association: ['Colorectal cancer (CRC)', 'Carcinoma of colon (CRC)'],
      }),
    ],
  }
  assert.strictEqual(
    parseResidueVariants(json, 600).notes[0]?.text,
    'Colorectal cancer; somatic mutation; most common mutation; constitutive and elevated kinase activity; efficiently induces cell transformation; …',
  )
})

test('residueVariantLines: two notes, then what they leave out by class', () => {
  assert.deepStrictEqual(
    residueVariantLines(parseResidueVariants(tp53At248, 248)),
    {
      at: 'residue 248 (R)',
      notes: [
        'Q, W — Li-Fraumeni syndrome; germline mutation and in sporadic cancers; somatic mutation',
        'G — sporadic cancers; somatic mutation',
      ],
      rest: 'Also uncertain significance → C; no clinical class → stop.',
    },
  )
  assert.deepStrictEqual(
    residueVariantLines(parseResidueVariants(tp53At248, 83)),
    { at: 'residue 83', notes: [] },
  )
})

test('parseOrigins: a strain is its species', () => {
  const origins = parseOrigins({
    results: [
      {
        primaryAccession: 'Q8NW39',
        organism: { scientificName: 'Staphylococcus aureus (strain MW2)' },
        genes: [{ geneName: { value: 'isdH' } }],
      },
      {
        primaryAccession: 'P03070',
        organism: { scientificName: 'Simian virus 40' },
      },
    ],
  })
  assert.deepStrictEqual(origins.get('Q8NW39'), {
    species: 'Staphylococcus aureus',
    gene: 'isdH',
  })
  assert.deepStrictEqual(origins.get('P03070'), {
    species: 'Simian virus 40',
    gene: undefined,
  })
})

// TP53 R248 and HBB residue 7 as PDBe-KB, InterPro and UniProt served them,
// 2026-10-11, pared down.
const region = (
  kind: 'domain' | 'interface' | 'ligand',
  name: string,
  accession: string,
  residues?: number[],
) => ({ kind, name, accession, start: 94, end: 292, residues })
const human = (gene?: string) => ({ species: 'Homo sapiens', gene })

test('residueContextText: domain, then DNA and itself ahead of other partners, then a virus', () => {
  const domains = [region('domain', 'p53, DNA-binding domain', 'IPR011615')]
  const partners = [
    region('interface', 'TP53-binding protein 1', 'Q12888', [248]),
    region('interface', 'Bcl-2-like protein 1', 'Q07817', [248]),
    region('interface', 'Large T antigen', 'P03070', [248]),
    region('interface', 'DNA', 'DNA', [248, 249]),
    region('interface', 'itself (homo-oligomer)', 'P04637', [248]),
    region('interface', 'Mdm2', 'Q00987', [30]),
  ]
  const ligands = [region('ligand', 'QNN +60', 'QNN', [248])]
  const origins = new Map<string, PartnerOrigin>([
    ['P04637', human('TP53')],
    ['Q12888', human('TP53BP1')],
    ['Q07817', human('BCL2L1')],
    ['Q00987', human('MDM2')],
    ['P03070', { species: 'Simian virus 40' }],
  ])
  assert.deepStrictEqual(partnerAccessions('P04637', partners), [
    'P04637',
    'Q12888',
    'Q07817',
    'P03070',
    'Q00987',
  ])
  assert.strictEqual(
    residueContextText(248, 'P04637', domains, {
      partners,
      ligands,
      origins,
    }),
    'Residue 248 lies in the domain “p53, DNA-binding domain”; contacts DNA, itself (homo-oligomer), TP53-binding protein 1 and 1 more; also touches Simian virus 40 Large T antigen; is in 1 ligand site.',
  )
})

test('residueContextText: off every interface of its own species, touched by a pathogen', () => {
  const domains = [
    { ...region('domain', 'Globin', 'IPR000971'), start: 1, end: 147 },
  ]
  const partners = [
    region('interface', 'itself (homo-oligomer)', 'P68871', [35, 99]),
    region('interface', 'Hemoglobin subunit alpha', 'P69905', [35, 40]),
    region(
      'interface',
      'Iron-regulated surface determinant protein H',
      'Q2FXJ2',
      [7],
    ),
    region(
      'interface',
      'Iron-regulated surface determinant protein H',
      'Q8NW39',
      [7],
    ),
    region(
      'interface',
      'Iron-regulated surface determinant protein B',
      'Q8NX66',
      [7],
    ),
  ]
  const aureus = (gene: string) => ({
    species: 'Staphylococcus aureus',
    gene,
  })
  const origins = new Map<string, PartnerOrigin>([
    ['P68871', human('HBB')],
    ['P69905', human('HBA1')],
    ['Q2FXJ2', aureus('isdH')],
    ['Q8NW39', aureus('isdH')],
    ['Q8NX66', aureus('isdB')],
  ])
  assert.strictEqual(
    residueContextText(7, 'P68871', domains, { partners, origins }),
    "Residue 7 lies in the domain “Globin”; is outside the protein's interfaces with itself (homo-oligomer) and Hemoglobin subunit alpha; touches only Staphylococcus aureus isdH and isdB.",
  )
})

test('residueContextText: before PDBe answers only the domain, and nothing off any region', () => {
  const domains = [
    { ...region('domain', 'Globin', 'IPR000971'), start: 1, end: 147 },
  ]
  assert.strictEqual(
    residueContextText(7, 'P68871', domains),
    'Residue 7 lies in the domain “Globin”.',
  )
  assert.strictEqual(
    residueContextText(500, 'P68871', domains, { partners: [], ligands: [] }),
    '',
  )
  assert.deepStrictEqual(
    partnerAccessions('P68871', [
      region('interface', 'itself (homo-oligomer)', 'P68871', [7]),
      region('interface', 'DNA', 'DNA', [7]),
    ]),
    [],
  )
})

test('residueContextText: a ligand with a name a reader knows is named', () => {
  // M. tuberculosis rpoB Ser456 (the papers' S450), PDBe-KB 2026-10-11
  const site = {
    ...region('ligand', 'RFP +4', 'RFP', [456]),
    ligands: [
      { id: 'RFP', name: 'RIFAMPICIN', residues: [456] },
      { id: 'SRN', name: 'SORANGICIN A', residues: [456] },
      { id: 'KYO', name: '(9S,14S)-5,6-tetrahydroxy', residues: [456] },
      { id: 'LNL', name: 'LINOLEIC ACID', residues: [455] },
    ],
  }
  assert.strictEqual(
    residueContextText(456, 'P9WGY9', [], { ligands: [site] }),
    'Residue 456 binds rifampicin and sorangicin A.',
  )
  assert.strictEqual(
    ligandName({ id: 'HEM', name: 'PROTOPORPHYRIN IX CONTAINING FE' }),
    'haem',
  )
  assert.strictEqual(
    ligandName({ id: 'BLA', name: 'BILIVERDINE IX ALPHA' }),
    'biliverdine IX alpha',
  )
})

test('unnamedLigands and parseLigandSynonyms: a drug found by its synonym', () => {
  // C. albicans ERG11 Tyr132 (P10613) and RCSB's chem_comps, 2026-10-11
  const site = {
    ...region('ligand', 'HEM +1', 'HEM', [132]),
    ligands: [
      { id: 'HEM', name: 'PROTOPORPHYRIN IX CONTAINING FE', residues: [132] },
      { id: '1YN', name: '2-[(2R)-butan-2-yl]-4-{4-[4-(4-…', residues: [132] },
      { id: 'TPF', name: '2-(2,4-DIFLUOROPHENYL)-1,3-…', residues: [131] },
    ],
  }
  assert.deepStrictEqual(unnamedLigands(132, [site]), ['1YN'])
  const synonyms = parseLigandSynonyms({
    data: {
      chem_comps: [
        {
          chem_comp: { id: '1YN' },
          rcsb_chem_comp_synonyms: [
            { name: '2-[(2R)-butan-2-yl]-4-{4-[4-(4-{[(2R,4S)-2-…' },
            { name: 'Itraconazole' },
          ],
        },
        {
          chem_comp: { id: 'QNN' },
          rcsb_chem_comp_synonyms: [
            { name: '(2~{S})-2-methyl-1-azabicyclo[2.2.2]octan-3-one' },
          ],
        },
        null,
      ],
    },
  })
  assert.deepStrictEqual([...synonyms], [['1YN', 'itraconazole']])
  assert.strictEqual(
    residueContextText(132, 'P10613', [], {
      ligands: [site],
      ligandSynonyms: synonyms,
    }),
    'Residue 132 binds haem and itraconazole.',
  )
})

// BRAF's kinase domain (P15056 457-717) up to the APE
// that closes the activation segment, as UniProt held it 2026-10-11
const BRAF_KINASE =
  'ITVGQRIGSGSFGTVYKGKWHGDVAVKMLNVTAPTPQQLQAFKNEVGVLRKTRHVNILLFMGYSTKPQLAIVTQWCEGSSLYHHLHIIETKFEMIKLIDIARQTAQGMDYLHAKSIIHRDLKSNNIFLHEDLTVKIGDFGLATVKSRWSGSHQFEQLSGSILWMAPE'
const braf = 'x'.repeat(456) + BRAF_KINASE

test('kinaseLandmarks: BRAF by its motifs, V600 in the activation segment', () => {
  const landmarks = kinaseLandmarks(braf, 457, 717)
  assert.deepStrictEqual(
    landmarks.map(l => [l.name.split(' (')[0]!.split(',')[0], l.start, l.end]),
    [
      ['glycine-rich loop', 464, 469],
      ['catalytic loop', 574, 581],
      ['activation segment', 594, 623],
    ],
  )
  const domains = [
    {
      kind: 'domain' as const,
      name: 'Serine-threonine/tyrosine-protein kinase, catalytic domain',
      accession: 'IPR001245',
      start: 457,
      end: 717,
    },
  ]
  assert.strictEqual(
    residueContextText(600, 'P15056', domains, { sequence: braf }),
    'Residue 600 lies in the domain “Serine-threonine/tyrosine-protein kinase, catalytic domain”, in its activation segment (DFG594–APE621), which switches the kinase on.',
  )
  assert.strictEqual(
    residueContextText(500, 'P15056', domains, { sequence: braf }),
    'Residue 500 lies in the domain “Serine-threonine/tyrosine-protein kinase, catalytic domain”.',
  )
})

test('residueFlag: the variant a label names, else the number', () => {
  assert.strictEqual(
    residueFlag({ position: 7, label: 'Sickle variant E6V (residue 7)' }),
    'E6V',
  )
  assert.strictEqual(
    residueFlag({ position: 248, label: 'Cancer hotspot R248' }),
    'R248',
  )
  assert.strictEqual(residueFlag({ position: 7, label: 'E7' }), 'E7')
  assert.strictEqual(residueFlag({ position: 83 }), '83')
})

test('residueContextText: antibodies are an epitope, not partners, and never sent to UniProt', () => {
  // EGFR (P00533) as PDBe-KB lists it, 2026-10-11, pared down
  const partners = [
    region('interface', 'itself (homo-oligomer)', 'P00533', [600]),
    region('interface', '175 heavy chain', 'IG-heavy chain', [858]),
    region('interface', 'Immunoglobulin kappa constant', 'P01834', [858]),
    region(
      'interface',
      'Growth factor receptor-bound protein 2',
      'P62993',
      [1],
    ),
  ]
  assert.deepStrictEqual(partnerAccessions('P00533', partners), [
    'P00533',
    'P62993',
  ])
  assert.strictEqual(
    residueContextText(858, 'P00533', [], { partners }),
    "Residue 858 is outside the protein's interfaces with itself (homo-oligomer) and Growth factor receptor-bound protein 2; is in an antibody epitope.",
  )
})

test('parseResidueVariants: a drug abbreviation is spelled out only where resistance is', () => {
  // M. tuberculosis katG S315T as UniProt words it, 2026-10-11
  const json = {
    features: [
      variant('315', 'T', 'missense', [], {
        wildType: 'S',
        note: 'strain: H0181/94, H0452/92; INH-resistant',
      }),
      variant('315', 'N', 'missense', [], {
        wildType: 'S',
        note: 'PAS-positive granules',
      }),
    ],
  }
  assert.deepStrictEqual(
    parseResidueVariants(json, 315).notes.map(n => n.text),
    ['PAS-positive granules', 'isoniazid-resistant'],
  )
})
