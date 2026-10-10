import assert from 'node:assert'
import { test } from 'node:test'

import { markFocus } from './proteinAlignments.ts'

import type { Focus } from './proteinFeatures.ts'
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
