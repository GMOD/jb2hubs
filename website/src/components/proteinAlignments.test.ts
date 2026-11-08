import assert from 'node:assert'
import { test } from 'node:test'

import { toCanonical, toTranslation } from './focus.ts'
import { SeedRefused } from './pfamSeed.ts'
import { markFocus, seedWindow } from './proteinAlignments.ts'

import type { GeneStructure } from './geneStructure.ts'
import type { Focus, ProteinRegion } from './proteinFeatures.ts'
import type { MsaSource } from './proteinSession.ts'

const seed: MsaSource = {
  kind: 'inline',
  msa: {
    fasta: '>PAX6/50-150\nA\n',
    querySeqName: 'PAX6/50-150',
    residueRange: { start: 50, end: 150 },
  },
}

test('markFocus: marks the residue the selection carried onto the translation, not the canonical number', () => {
  // PAX6's MANE isoform has 14 residues more than the canonical ahead of the
  // paired domain, so canonical residue 100 is translation residue 114
  const marked = markFocus(
    seed,
    { kind: 'residue', position: 100, label: 'R100' },
    [{ start: 114, end: 114 }],
  )
  assert.ok(marked?.kind === 'inline')
  assert.deepEqual(marked.msa.highlights, [
    { row: 'PAX6/50-150', start: 65, end: 65, label: 'R100' },
  ])
  assert.deepEqual(marked.msa.region, {
    row: 'PAX6/50-150',
    start: 45,
    end: 85,
  })
})

test('markFocus: the window stops at the ends of the segment', () => {
  const marked = markFocus(seed, { kind: 'residue', position: 52 }, [
    { start: 52, end: 52 },
  ])
  assert.ok(marked?.kind === 'inline')
  assert.deepEqual(marked.msa.region, {
    row: 'PAX6/50-150',
    start: 1,
    end: 23,
  })
})

test('markFocus: a residue outside the segment, or one the isoform lacks, marks nothing', () => {
  const focus: Focus = { kind: 'residue', position: 40 }
  assert.equal(markFocus(seed, focus, [{ start: 40, end: 40 }]), seed)
  assert.equal(markFocus(seed, focus, []), seed)
})

test('markFocus: leaves an alignment without a query segment alone', () => {
  const built: MsaSource = {
    kind: 'built',
    msa: {
      orthologParams: {
        taxId: 9606,
        geneCandidates: ['TP53'],
        source: 'ncbi',
        msaAlgorithm: 'browser',
      },
    },
  }
  const focus: Focus = { kind: 'residue', position: 248 }
  assert.equal(markFocus(built, focus, [{ start: 248, end: 248 }]), built)
})

// A pseudo-random protein, so the isoform alignment has one way to match.
function protein(length: number, seed: number) {
  const letters = 'ACDEFGHIKLMNPQRSTVWY'
  let x = seed
  return Array.from({ length }, () => {
    x = (x * 1103515245 + 12345) % 2 ** 31
    return letters[x % 20]
  }).join('')
}

test('seedWindow: carries a canonical domain onto an isoform with an insertion before it', () => {
  const canonical = protein(300, 1)
  // 100 residues the canonical lacks, ahead of a domain at 150–250
  const translation =
    canonical.slice(0, 100) + protein(100, 2) + canonical.slice(100)
  const structure = {
    canonical,
    proteinSequence: translation,
    alphafold: [],
  } as unknown as GeneStructure
  const domain = { start: 150, end: 250 } as ProteinRegion
  assert.deepEqual(seedWindow(structure, domain), { start: 209, end: 390 })
})

test('seedWindow: keeps the canonical coordinates where the two are one sequence', () => {
  const canonical = protein(300, 1)
  const structure = {
    canonical,
    proteinSequence: canonical,
    alphafold: [],
  } as unknown as GeneStructure
  const domain = { start: 150, end: 250 } as ProteinRegion
  assert.deepEqual(seedWindow(structure, domain), { start: 109, end: 290 })
})

test('seedWindow: refuses a domain the launched isoform lacks', () => {
  const canonical = protein(300, 1)
  const structure = {
    canonical,
    proteinSequence: canonical.slice(0, 149) + canonical.slice(250),
    alphafold: [],
  } as unknown as GeneStructure
  const domain = { name: 'Ig-like', start: 150, end: 250 } as ProteinRegion
  assert.throws(
    () => seedWindow(structure, domain),
    (e: unknown) =>
      e instanceof SeedRefused &&
      e.message === 'The launched transcript lacks Ig-like',
  )
})

test('seedWindow: refuses rather than reading canonical numbers on an isoform too long to align', () => {
  const canonical = protein(7000, 1)
  const structure = {
    canonical,
    proteinSequence: protein(100, 2) + canonical,
    alphafold: [],
  } as unknown as GeneStructure
  const domain = { name: 'Ig-like', start: 150, end: 250 } as ProteinRegion
  assert.throws(() => seedWindow(structure, domain), SeedRefused)
})

test('a focus carries onto the translation and back, and nowhere without the canonical', () => {
  const canonical = protein(300, 1)
  const translation =
    canonical.slice(0, 100) + protein(100, 2) + canonical.slice(100)
  const structure = {
    canonical,
    proteinSequence: translation,
    alphafold: [],
  } as unknown as GeneStructure
  assert.deepEqual(toTranslation(structure, [{ start: 150, end: 160 }]), [
    { start: 250, end: 260 },
  ])
  assert.deepEqual(toCanonical(structure, [{ start: 250, end: 260 }]), [
    { start: 150, end: 160 },
  ])
  const unknown = {
    proteinSequence: translation,
    alphafold: [],
  } as unknown as GeneStructure
  assert.equal(toTranslation(unknown, [{ start: 150, end: 160 }]), undefined)
  assert.equal(toCanonical(unknown, [{ start: 250, end: 260 }]), undefined)
  assert.throws(
    () =>
      seedWindow(unknown, {
        name: 'Ig-like',
        start: 150,
        end: 250,
      } as ProteinRegion),
    SeedRefused,
  )
})
