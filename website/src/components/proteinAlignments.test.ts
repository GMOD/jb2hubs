import assert from 'node:assert'
import { test } from 'node:test'

import { loadLive, queryIsoform } from './proteinAlignments.ts'

import type { GeneStructure, Isoform } from './geneStructure.ts'
import type { ProteinPanel } from './proteinMsa.ts'

const model = (name: string, start: number): Isoform['transcript'] => ({
  refName: 'NC_000017.11',
  strand: 1,
  name,
  geneName: 'TEST',
  cds: [{ start, end: start + 30, phase: 0 }],
})

const mane: Isoform = {
  transcript: model('NM_000001.4', 100),
  protein: 'NP_000001.1',
  aaLength: 9,
  tag: 'MANE Select',
}
const longer: Isoform = {
  transcript: model('XM_000002.1', 200),
  protein: 'XP_000002.2',
  aaLength: 12,
}

const structure: GeneStructure = {
  symbol: 'TEST',
  geneId: '1',
  taxId: 9606,
  assemblyAccession: 'GCF_000001405.40',
  target: {
    configUrl: '/ucsc/hg38/config.json',
    assemblyName: 'hg38',
    variantTrackIds: [],
    canonicalRefName: (r: string) => r,
  },
  transcript: mane.transcript,
  isoforms: [mane, longer],
  proteinSequence: 'MEEPQSDPS',
  alphafold: [],
}

test('queryIsoform: the row names its protein, version-tolerant', () => {
  assert.strictEqual(queryIsoform(structure, 'XP_000002.2', ''), longer)
  assert.strictEqual(queryIsoform(structure, 'XP_000002.3', ''), longer)
  assert.strictEqual(queryIsoform(structure, 'NP_000001.1', ''), mane)
})

test('queryIsoform: a UniProt row matches the representative on sequence alone', () => {
  assert.strictEqual(queryIsoform(structure, 'P04637', 'MEEPQSDPS'), mane)
  assert.strictEqual(queryIsoform(structure, 'P04637', 'MEEPQSDPSV'), undefined)
})

const panel = (protein: string): ProteinPanel => ({
  query: { symbol: 'TEST', refTaxonId: 9606, source: 'ncbi' },
  rows: [
    {
      taxId: 9606,
      label: 'Human',
      scientificName: 'H',
      protein,
      length: 12,
      domains: [],
    },
    {
      taxId: 10090,
      label: 'Mouse',
      scientificName: 'M',
      protein: 'NP_9.1',
      length: 9,
      domains: [],
    },
  ],
})

const precomputed = {
  fasta: '>Human\nMEEPQSDP-SVEP\n>Mouse\nMEE-QSDPLS---',
  newick: '(Human:1,Mouse:1);',
  gff: '##gff-version 3',
}

test('loadLive: the session opens on the isoform the query row is, with its sequence', async () => {
  const loaded = await loadLive(
    structure,
    panel('XP_000002.2'),
    precomputed,
    () => undefined,
    new AbortController().signal,
  )
  assert.deepStrictEqual(loaded.structureOverrides, {
    transcript: longer.transcript,
    proteinSequence: 'MEEPQSDPSVEP',
  })
  assert.strictEqual(loaded.note, undefined)
})

test('loadLive: a row no isoform translates to keeps the representative, and says so', async () => {
  const loaded = await loadLive(
    structure,
    panel('Q99999'),
    precomputed,
    () => undefined,
    new AbortController().signal,
  )
  assert.deepStrictEqual(loaded.structureOverrides, {
    transcript: mane.transcript,
    proteinSequence: 'MEEPQSDPS',
  })
  assert.match(loaded.note ?? '', /Q99999.*by position/)
})
