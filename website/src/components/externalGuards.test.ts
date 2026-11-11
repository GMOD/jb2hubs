import assert from 'node:assert'
import { test } from 'node:test'

import { isAbsentOr, isString } from 'hubtools/guards'

import { codingExtents, isProductReports } from './codingExtent.ts'
import { isDatasetsGeneReports, taxonIdOf } from './genePlacements.ts'
import { dedupeHits, isMyGeneQuery } from './geneSearch.ts'
import { isSubtreeResponse } from './multiSyntenyTaxonTree.ts'
import { isOrthologCount } from './ncbiFetch.ts'
import { isNcbiOrthologResponse } from './orthologResults.ts'
import {
  buildRows,
  isEsearch,
  isGeneReports,
  isTaxonSummary,
  pickBySymbol,
} from './orthologSet.ts'
import { parseInterfaceRegions, parseLigandSites } from './pdbeContacts.ts'
import {
  isConservationAnswer,
  isRcsbChemComps,
  isUniProtFeatures,
  isUniProtOrigins,
} from './residueFacts.ts'
import { isVariationAnswer } from './residueVariants.ts'

const datasetsGene = {
  gene_id: '7157',
  symbol: null,
  type: null,
  tax_id: null,
  annotations: [
    {
      assembly_accession: null,
      genomic_locations: [
        {
          genomic_accession_version: 'NC_000017.11',
          sequence_name: null,
          genomic_range: null,
        },
        { genomic_range: { begin: '1', end: null, orientation: null } },
      ],
    },
    { genomic_locations: null },
  ],
}

const guards = [
  {
    name: 'MyGene query',
    guard: isMyGeneQuery,
    withNulls: [{ hits: [{ symbol: null, entrezgene: null }] }, { hits: null }],
    wrongType: [{ hits: [{ symbol: 7 }] }, { hits: [{ entrezgene: true }] }],
  },
  {
    name: 'NCBI product report',
    guard: isProductReports,
    withNulls: [
      { reports: null },
      { reports: [{ product: null }] },
      {
        reports: [
          {
            product: {
              gene_id: null,
              transcripts: [
                { cds: null, genomic_locations: null },
                {
                  cds: { range: [{ begin: null, end: null }] },
                  genomic_locations: [
                    {
                      genomic_accession_version: null,
                      exons: [
                        {
                          begin: null,
                          end: null,
                          orientation: null,
                          order: null,
                        },
                      ],
                    },
                    { exons: null },
                  ],
                },
              ],
            },
          },
        ],
      },
    ],
    wrongType: [
      { reports: [{ product: { gene_id: 7157 } }] },
      { reports: [{ product: { transcripts: [{ cds: { range: {} } }] } }] },
    ],
  },
  {
    name: 'NCBI ortholog count',
    guard: isOrthologCount,
    withNulls: [{ reports: null, total_count: null }],
    wrongType: [{ total_count: '658' }, { reports: {} }],
  },
  {
    name: 'NCBI gene dataset report',
    guard: isDatasetsGeneReports,
    withNulls: [
      { reports: null },
      { reports: [{ gene: null }, { gene: datasetsGene }] },
    ],
    wrongType: [
      { reports: [{ gene: { gene_id: 7157 } }] },
      { reports: [{ gene: { annotations: {} } }] },
    ],
  },
  {
    name: 'NCBI orthologs',
    guard: isNcbiOrthologResponse,
    withNulls: [
      { reports: null, total_count: null },
      {
        reports: [
          { gene: { ...datasetsGene, taxname: null, common_name: null } },
        ],
      },
    ],
    wrongType: [
      { reports: [{ gene: { taxname: 9606 } }] },
      { reports: [{ gene: null }] },
      { reports: [{}] },
    ],
  },
  {
    name: 'NCBI gene report',
    guard: isGeneReports,
    withNulls: [
      {
        reports: [
          {
            gene: {
              ...datasetsGene,
              synonyms: null,
              description: null,
              taxname: null,
              common_name: null,
              map_locations: [{ map_type: null, map_value: null }],
              ensembl_gene_ids: null,
              swiss_prot_accessions: null,
            },
          },
          { gene: { map_locations: null } },
        ],
      },
    ],
    wrongType: [
      { reports: [{ gene: { synonyms: 'P53' } }] },
      { reports: [{ gene: { map_locations: [{ map_value: 17 }] } }] },
    ],
  },
  {
    name: 'NCBI esearch',
    guard: isEsearch,
    withNulls: [{ esearchresult: null }, { esearchresult: { idlist: null } }],
    wrongType: [
      { esearchresult: { idlist: [7157] } },
      { esearchresult: 'none' },
    ],
  },
  {
    name: 'NCBI taxon summary',
    guard: isTaxonSummary,
    withNulls: [{ scientificname: null, commonname: null, rank: null }],
    wrongType: [{ rank: 1 }],
  },
  {
    name: 'NCBI taxonomy subtree',
    guard: isSubtreeResponse,
    withNulls: [
      { edges: null },
      {
        edges: {
          1: {
            visible_children: null,
            scientific_name: null,
            curator_common_name: null,
            rank: null,
          },
        },
      },
    ],
    wrongType: [
      { edges: { 1: { visible_children: ['9606'] } } },
      { edges: { 1: null } },
    ],
  },
  {
    name: 'UniProt partner origins',
    guard: isUniProtOrigins,
    withNulls: [
      { results: null },
      {
        results: [
          { primaryAccession: null, organism: null, genes: null },
          {
            organism: { scientificName: null },
            genes: [{ geneName: null }, { geneName: { value: null } }],
          },
        ],
      },
    ],
    wrongType: [
      { results: [{ primaryAccession: 4637 }] },
      { results: [{ genes: {} }] },
    ],
  },
  {
    name: 'RCSB chemical components',
    guard: isRcsbChemComps,
    withNulls: [
      { data: null },
      { data: { chem_comps: null } },
      {
        data: {
          chem_comps: [
            null,
            { chem_comp: null, rcsb_chem_comp_synonyms: null },
            {
              chem_comp: { id: null },
              rcsb_chem_comp_synonyms: [{ name: null }],
            },
          ],
        },
      },
    ],
    wrongType: [
      { data: { chem_comps: [{ chem_comp: { id: 1 } }] } },
      { data: { chem_comps: [{ rcsb_chem_comp_synonyms: 'zinc' }] } },
    ],
  },
  {
    name: 'UniProt features',
    guard: isUniProtFeatures,
    withNulls: [
      { features: null },
      {
        features: [
          {
            type: null,
            description: null,
            location: null,
            alternativeSequence: null,
          },
          {
            location: { start: null, end: { value: null } },
            alternativeSequence: {
              originalSequence: null,
              alternativeSequences: null,
            },
          },
        ],
      },
    ],
    wrongType: [
      { features: [{ location: { start: { value: '5' } } }] },
      { features: [{ description: 5 }] },
    ],
  },
  {
    name: 'PDBe conservation',
    guard: isConservationAnswer,
    withNulls: [{ data: null }],
    wrongType: [{ data: 'none' }],
  },
  {
    name: 'UniProt variation',
    guard: isVariationAnswer,
    withNulls: [
      { features: null },
      {
        features: [
          {
            begin: null,
            end: null,
            wildType: null,
            alternativeSequence: null,
            consequenceType: null,
            clinicalSignificances: null,
            descriptions: null,
            evidences: null,
            association: null,
          },
          {
            descriptions: [{ value: 'SKCA', sources: null }],
            association: [{ name: null }],
          },
        ],
      },
    ],
    wrongType: [
      { features: [{ begin: 175 }] },
      { features: [{ clinicalSignificances: [{ type: null }] }] },
      { features: [{ descriptions: [{ value: null }] }] },
    ],
  },
]

for (const { name, guard, withNulls, wrongType } of guards) {
  test(`${name}: a null in an optional field is an absent one`, () => {
    for (const answer of withNulls) {
      assert.ok(guard(answer), JSON.stringify(answer))
    }
  })
  test(`${name}: a wrong type, or a null in a required field, is refused`, () => {
    for (const answer of wrongType) {
      assert.ok(!guard(answer), JSON.stringify(answer))
    }
  })
}

test('isAbsentOr: missing or null passes, another type does not', () => {
  const guard = isAbsentOr(isString)
  assert.ok(guard(undefined))
  assert.ok(guard(null))
  assert.ok(guard('p53'))
  assert.ok(!guard(53))
})

const contactRows = [
  { startIndex: null, endIndex: null, allPDBEntries: null },
  { startIndex: 10, endIndex: null, allPDBEntries: ['1tup'] },
  { startIndex: 11, endIndex: 12, allPDBEntries: null },
]

test('PDBe interface residues: nulls in optional fields are absent ones', () => {
  const regions = parseInterfaceRegions(
    {
      P04637: {
        length: null,
        data: [
          { name: 'MDM2', accession: 'Q00987', residues: contactRows },
          { name: null, accession: null, residues: null },
        ],
      },
    },
    'P04637',
  )
  assert.deepStrictEqual(
    regions.map(r => [r.name, r.residues, r.pdbIds]),
    [['MDM2', [10, 11, 12], ['1tup']]],
  )
  assert.deepStrictEqual(parseInterfaceRegions({ P04637: null }, 'P04637'), [])
  assert.deepStrictEqual(
    parseInterfaceRegions({ P04637: { data: null } }, 'P04637'),
    [],
  )
})

test('PDBe interface residues: a wrong type is refused', () => {
  assert.throws(
    () =>
      parseInterfaceRegions(
        { P04637: { data: [{ residues: [{ startIndex: '10' }] }] } },
        'P04637',
      ),
    TypeError,
  )
})

test('PDBe ligand sites: nulls in optional fields are absent ones', () => {
  const sites = parseLigandSites(
    {
      P04637: {
        data: [
          {
            name: null,
            accession: 'ZN',
            residues: contactRows,
            additionalData: null,
          },
          {
            name: 'water',
            accession: null,
            residues: null,
            additionalData: { isSolvent: null },
          },
        ],
      },
    },
    'P04637',
  )
  assert.deepStrictEqual(
    sites.map(s => [s.name, s.residues]),
    [['ZN', [10, 11, 12]]],
  )
})

test('PDBe ligand sites: a wrong type is refused', () => {
  assert.throws(
    () =>
      parseLigandSites(
        { P04637: { data: [{ additionalData: { isSolvent: 'no' } }] } },
        'P04637',
      ),
    TypeError,
  )
})

test('a null GeneID from MyGene is a hit without one', () => {
  assert.deepStrictEqual(
    dedupeHits([
      { symbol: 'BRCA1P1', entrezgene: null },
      { symbol: null, entrezgene: 672 },
    ]),
    [{ symbol: 'BRCA1P1', geneId: undefined }],
  )
})

test('a null tax_id is no taxon, not taxon 0', () => {
  assert.ok(Number.isNaN(taxonIdOf({ tax_id: null })))
  assert.strictEqual(taxonIdOf({ tax_id: '9606' }), 9606)
  assert.deepStrictEqual(
    buildRows([{ gene: null }, { gene: datasetsGene }]),
    [],
  )
})

test('a null exon coordinate places no coding extent at 0', () => {
  const extents = codingExtents(
    [
      {
        product: {
          gene_id: '1',
          transcripts: [
            {
              cds: { range: [{ begin: '1', end: '9' }] },
              genomic_locations: [
                {
                  genomic_accession_version: 'NC_1',
                  exons: [{ begin: null, end: null, order: 1 }],
                },
              ],
            },
          ],
        },
      },
    ],
    new Map([['1', 'NC_1']]),
  )
  assert.strictEqual(extents.size, 0)
})

test('pickBySymbol: a candidate with a null GeneID resolves to none', () => {
  assert.strictEqual(
    pickBySymbol('TTN', [{ gene_id: null, symbol: 'TTN', synonyms: null }]),
    undefined,
  )
})
