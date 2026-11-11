import assert from 'node:assert'
import { test } from 'node:test'

import {
  privateResidues,
  toCanonical,
  toTranslation,
  translationRanges,
} from './focus.ts'
import { parseGeneTableBlocks } from './geneStructure.ts'
import { sharedCodons } from './isoformCodons.ts'
import {
  FGFR2_IIIB,
  FGFR2_IIIC,
  FGFR2_TABLE,
  PKM1,
  PKM2,
  PKM_TABLE,
} from './isoformFixtures.ts'

import type { GeneStructure, Isoform } from './geneStructure.ts'

function isoformsOf(table: string, geneName: string, refName: string) {
  return parseGeneTableBlocks(table, -1).map((t): Isoform => ({
    transcript: {
      refName,
      strand: -1,
      name: t.mrna,
      geneName,
      cds: t.cds,
    },
    protein: t.protein,
    aaLength: t.aaLength,
  }))
}

function isoform(isoforms: Isoform[], protein: string) {
  const found = isoforms.find(i => i.protein === protein)
  assert.ok(found)
  return found
}

// The gene launched on `launched` where UniProt's canonical is another isoform
function launchedOn(
  isoforms: Isoform[],
  launched: { protein: string; sequence: string },
  canonical: { protein: string; sequence: string },
): GeneStructure {
  const lead = isoform(isoforms, launched.protein)
  return {
    symbol: lead.transcript.geneName,
    geneId: '1',
    taxId: 9606,
    assemblyAccession: 'GCF_000001405.40',
    target: {
      configUrl: '/ucsc/hg38/config.json',
      assemblyName: 'hg38',
      variantTrackIds: [],
      canonicalRefName: (refName: string) => refName,
    },
    transcript: lead.transcript,
    proteinSequence: launched.sequence,
    canonical: canonical.sequence,
    alphafold: [],
    isoforms,
    refseq: [],
    canonicalIsoform: isoform(isoforms, canonical.protein),
  }
}

const pkm = isoformsOf(PKM_TABLE, 'PKM', 'NC_000015.10')
const pkm1 = launchedOn(
  pkm,
  { protein: 'NP_872270.1', sequence: PKM1 },
  { protein: 'NP_002645.3', sequence: PKM2 },
)

const fgfr2 = isoformsOf(FGFR2_TABLE, 'FGFR2', 'NC_000010.11')
const fgfr2IIIb = launchedOn(
  fgfr2,
  { protein: 'NP_075259.4', sequence: FGFR2_IIIB },
  { protein: 'NP_000132.3', sequence: FGFR2_IIIC },
)

test('the fixtures parse to the proteins they name', () => {
  assert.deepEqual(
    pkm.map(i => [i.protein, i.aaLength]),
    [
      ['NP_002645.3', PKM2.length],
      ['NP_872270.1', PKM1.length],
    ],
  )
  assert.deepEqual(
    fgfr2.map(i => [i.protein, i.aaLength]),
    [
      ['NP_000132.3', FGFR2_IIIC.length],
      ['NP_075259.4', FGFR2_IIIB.length],
    ],
  )
})

test('sharedCodons: a transcript shares every codon with itself, stop included', () => {
  const { transcript } = isoform(pkm, 'NP_002645.3')
  const shared = sharedCodons(transcript, transcript)
  assert.equal(shared.size, PKM2.length + 1)
  assert.ok([...shared].every(([from, to]) => from === to))
})

test('sharedCodons: every shared codon spells the same residue in both isoforms', () => {
  for (const [structure, from, to] of [
    [pkm1, PKM2, PKM1],
    [fgfr2IIIb, FGFR2_IIIC, FGFR2_IIIB],
  ] as const) {
    const { canonicalIsoform } = structure
    assert.ok(canonicalIsoform)
    const shared = sharedCodons(
      canonicalIsoform.transcript,
      structure.transcript,
    )
    assert.deepEqual(
      [...shared].filter(([a, b]) => from[a] !== to[b]),
      [],
    )
  }
})

// PKM's exons 9 (M1) and 10 (M2) are paralogues of one length: both proteins
// run 531 residues, and the exon is residues 381-436 of each.
test('PKM: the mutually exclusive exon is private to each isoform', () => {
  assert.deepEqual(privateResidues(pkm1), {
    canonical: [{ start: 381, end: 436 }],
    launched: [{ start: 381, end: 436 }],
  })
})

// The two exons open on the same eight residues (IAREAEAA) and close on the
// same three (SGR), so the shared-stretch rule carries eleven residues of
// M2's exon 10 onto M1's exon 9, which is other bases of the genome.
test('PKM: the alignment carries residues of exon 10 onto exon 9, the codons carry none', () => {
  const exon = [{ start: 381, end: 436 }]
  assert.deepEqual(translationRanges(exon, PKM2, PKM1), [
    { start: 381, end: 388 },
    { start: 434, end: 436 },
  ])
  assert.deepEqual(toTranslation(pkm1, exon), [])
  assert.deepEqual(toCanonical(pkm1, exon), [])
})

test('PKM: residues either side of the exon keep their number', () => {
  assert.deepEqual(toTranslation(pkm1, [{ start: 370, end: 440 }]), [
    { start: 370, end: 380 },
    { start: 437, end: 440 },
  ])
  assert.deepEqual(toCanonical(pkm1, [{ start: 437, end: 531 }]), [
    { start: 437, end: 531 },
  ])
})

// IIIc is 49 residues (314-362) and IIIb 50 (314-363). The alanine that ends
// IIIc and the one that ends IIIb are different codons.
test('FGFR2: IIIb and IIIc are private, and the residues after them shift by one', () => {
  assert.deepEqual(privateResidues(fgfr2IIIb), {
    canonical: [{ start: 314, end: 362 }],
    launched: [{ start: 314, end: 363 }],
  })
  assert.deepEqual(toTranslation(fgfr2IIIb, [{ start: 300, end: 370 }]), [
    { start: 300, end: 313 },
    { start: 364, end: 371 },
  ])
})

test('FGFR2: the alignment carries the last residue of IIIc onto IIIb, the codons do not', () => {
  const last = [{ start: 362, end: 362 }]
  assert.deepEqual(translationRanges(last, FGFR2_IIIC, FGFR2_IIIB), [
    { start: 363, end: 363 },
  ])
  assert.deepEqual(toTranslation(fgfr2IIIb, last), [])
})

test('with no isoform spelling the canonical, the two proteins are aligned', () => {
  const aligned = { ...pkm1, canonicalIsoform: undefined }
  assert.equal(privateResidues(aligned), undefined)
  assert.deepEqual(toTranslation(aligned, [{ start: 381, end: 436 }]), [
    { start: 381, end: 388 },
    { start: 434, end: 436 },
  ])
})
