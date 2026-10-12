import assert from 'node:assert'
import { test } from 'node:test'

import {
  hundredWayRefusal,
  markFocus,
  seedWindow,
} from './proteinAlignments.ts'

import type { GeneStructure, Transcript } from './geneStructure.ts'
import type { LoadedAlignment } from './proteinAlignments.ts'
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
})

test('markFocus: a residue outside the segment, or one the isoform lacks, marks nothing', () => {
  const focus: Focus = { kind: 'residue', position: 40 }
  assert.equal(markFocus(seed, focus, [{ start: 40, end: 40 }]), seed)
  assert.equal(markFocus(seed, focus, []), seed)
})

test('markFocus: leaves an alignment without a query segment alone', () => {
  const built: MsaSource = {
    kind: 'indexed',
    msa: { msaUri: 'a', treeUri: 'b', msaName: 'TP53', querySeqName: 'hg38' },
  }
  const focus: Focus = { kind: 'residue', position: 248 }
  assert.equal(markFocus(built, focus, [{ start: 248, end: 248 }]), built)
})

const transcript = (name: string): Transcript => ({
  refName: 'chr11',
  strand: -1,
  name,
  geneName: 'HBB',
  cds: [],
})

const hundredWay = (proteinSequence: string): LoadedAlignment => ({
  source: {
    kind: 'indexed',
    msa: { msaUri: 'a', treeUri: 'b', msaName: 'HBB', querySeqName: 'hg38' },
  },
  carries: 'the 100-vertebrate alignment',
  structureOverrides: {
    proteinSequence,
    transcript: transcript('ENST00000380315.2'),
  },
})

test('hundredWayRefusal: the 100-way is kept only where its human row is the translation', () => {
  const gene = {
    proteinSequence: 'MVHLTPEEK',
    transcript: transcript('NM_000518.5'),
  }
  assert.equal(hundredWayRefusal(hundredWay('MVHLTPEEK'), gene), undefined)
  assert.equal(
    hundredWayRefusal(hundredWay('MVHLT'), gene),
    'The 100-vertebrate alignment is left out: its human row is ENST00000380315.2, not NM_000518.5.',
  )
  // with no translation of its own, the gene takes the row's
  assert.equal(
    hundredWayRefusal(hundredWay('MVHLT'), {
      ...gene,
      proteinSequence: undefined,
    }),
    undefined,
  )
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
