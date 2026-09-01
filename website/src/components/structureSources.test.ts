import assert from 'node:assert'
import { test } from 'node:test'

import {
  parseAlphaFoldModels,
  parseExperimentalStructures,
  pickAlphaFoldModel,
} from './structureSources.ts'

const entry = (
  id: string,
  accession: string,
  sequence: string,
  plddt = 80,
) => ({
  modelEntityId: id,
  uniprotAccession: accession,
  cifUrl: `https://alphafold.ebi.ac.uk/files/${id}-model_v6.cif`,
  pdbUrl: `https://alphafold.ebi.ac.uk/files/${id}-model_v6.pdb`,
  latestVersion: 6,
  globalMetricValue: plddt,
  paeImageUrl: `https://alphafold.ebi.ac.uk/files/${id}-predicted_aligned_error_v6.png`,
  sequence,
})

test('parseAlphaFoldModels: one model per entry, incomplete entries dropped', () => {
  const models = parseAlphaFoldModels([
    entry('AF-P04637-F1', 'P04637', 'MEEPQ', 75.06),
    { modelEntityId: 'AF-X-F1' },
  ])
  assert.equal(models.length, 1)
  assert.deepEqual(models[0], {
    entity: 'AF-P04637-F1',
    accession: 'P04637',
    url: 'https://alphafold.ebi.ac.uk/files/AF-P04637-F1-model_v6.cif',
    pdbUrl: 'https://alphafold.ebi.ac.uk/files/AF-P04637-F1-model_v6.pdb',
    version: 6,
    plddt: 75.06,
    paeImageUrl:
      'https://alphafold.ebi.ac.uk/files/AF-P04637-F1-predicted_aligned_error_v6.png',
    sequence: 'MEEPQ',
  })
})

test('parseAlphaFoldModels: a 404 body or anything else non-array is no model', () => {
  assert.deepEqual(parseAlphaFoldModels({ detail: 'not found' }), [])
})

// Dystrophin: no canonical model exists, only isoform models. The url the page
// used to build from the accession 404'd.
const dmd = parseAlphaFoldModels([
  entry('AF-P11532-9-F1', 'P11532-9', 'M'.repeat(525)),
  entry('AF-P11532-3-F1', 'P11532-3', 'M'.repeat(2341)),
  entry('AF-P11532-2-F1', 'P11532-2', 'MK'.repeat(1172)),
])

test('pickAlphaFoldModel: the model folded from this exact translation wins', () => {
  assert.equal(
    pickAlphaFoldModel(dmd, 'MK'.repeat(1172))?.entity,
    'AF-P11532-2-F1',
  )
})

test('pickAlphaFoldModel: else the canonical entry, else the longest isoform', () => {
  const withCanonical = [
    ...dmd,
    ...parseAlphaFoldModels([entry('AF-P11532-F1', 'P11532', 'MMM')]),
  ]
  assert.equal(pickAlphaFoldModel(withCanonical, 'XYZ')?.entity, 'AF-P11532-F1')
  assert.equal(pickAlphaFoldModel(dmd, 'XYZ')?.entity, 'AF-P11532-2-F1')
  assert.equal(pickAlphaFoldModel([], 'XYZ'), undefined)
})

const beacons = {
  structures: [
    {
      summary: {
        model_identifier: 'AF-P04637-F1',
        model_category: 'AB-INITIO',
        provider: 'AlphaFold DB',
        uniprot_start: 1,
        uniprot_end: 393,
        coverage: 1,
      },
    },
    {
      summary: {
        model_identifier: '9C5S',
        model_category: 'EXPERIMENTALLY DETERMINED',
        provider: 'PDBe',
        experimental_method: 'X-RAY DIFFRACTION',
        resolution: 1.01,
        uniprot_start: 17,
        uniprot_end: 30,
        coverage: 0.036,
      },
    },
    {
      summary: {
        model_identifier: '3d06',
        model_category: 'EXPERIMENTALLY DETERMINED',
        provider: 'PDBe',
        experimental_method: 'X-RAY DIFFRACTION',
        resolution: 1.2,
        uniprot_start: 94,
        uniprot_end: 293,
        coverage: 0.509,
      },
    },
    {
      summary: {
        model_identifier: '436',
        model_category: 'EXPERIMENTALLY DETERMINED',
        provider: 'SASBDB',
        uniprot_start: 718,
        uniprot_end: 1368,
        coverage: 1,
      },
    },
    {
      summary: {
        model_identifier: '2ocj',
        model_category: 'EXPERIMENTALLY DETERMINED',
        provider: 'PDBe',
        experimental_method: 'X-RAY DIFFRACTION',
        resolution: 2.05,
        uniprot_start: 94,
        uniprot_end: 293,
        coverage: 0.509,
      },
    },
  ],
}

test('parseExperimentalStructures: PDBe only, best coverage then sharpest', () => {
  const found = parseExperimentalStructures(beacons)
  assert.deepEqual(
    found.map(s => s.pdbId),
    ['3d06', '2ocj', '9c5s'],
  )
  assert.deepEqual(found[0], {
    pdbId: '3d06',
    method: 'X-RAY DIFFRACTION',
    resolution: 1.2,
    start: 94,
    end: 293,
    coverage: 0.509,
  })
})

test('parseExperimentalStructures: an empty or malformed summary is no entries', () => {
  assert.deepEqual(parseExperimentalStructures({}), [])
  assert.deepEqual(parseExperimentalStructures(null), [])
})
