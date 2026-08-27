import assert from 'node:assert'
import { test } from 'node:test'

import { parseChromAlias, pickGeneTrack } from './genomeTarget.ts'

// GenArk publishes one column per naming scheme and the config's adapter names
// which one is canonical.
const genArk = [
  '# refseq\tassembly\tgenbank\tncbi\tucsc',
  'NC_000067.7\t1\tCM000994.3\t1\tchr1',
  'NC_000068.8\t2\tCM000995.3\t2\tchr2',
].join('\n')

// A golden-path chromAlias labels only its first column, and that column is the
// canonical one.
const goldenPath = [
  '# sequenceName\talias names\tUCSC database: hg38',
  'chr1\t1\tCM000663.2\tNC_000001.11',
  'chr17\t17\tCM000679.2\tNC_000017.11',
].join('\n')

test('parseChromAlias: the named column is canonical, every other cell an alias', () => {
  const map = parseChromAlias(genArk, 'ucsc')
  assert.equal(map.get('NC_000067.7'), 'chr1')
  assert.equal(map.get('CM000994.3'), 'chr1')
  assert.equal(map.get('2'), 'chr2')
})

// The lookup runs over names that may already be canonical (the 100-way sidecar
// names sequences the UCSC way), so it has to be a no-op for those rather than
// dropping them.
test('parseChromAlias: a canonical name maps to itself', () => {
  assert.equal(parseChromAlias(genArk, 'ucsc').get('chr1'), 'chr1')
  assert.equal(parseChromAlias(goldenPath).get('chr17'), 'chr17')
})

test('parseChromAlias: no named column means the first one, as golden path does', () => {
  const map = parseChromAlias(goldenPath)
  assert.equal(map.get('NC_000017.11'), 'chr17')
  assert.equal(map.get('CM000663.2'), 'chr1')
})

// A column the file does not carry must not throw or return an empty map: the
// alias file is the difference between a session that highlights and one that
// silently does not, so falling back to column 0 keeps the common case working.
test('parseChromAlias: an unmatched column name falls back to the first', () => {
  assert.equal(
    parseChromAlias(genArk, 'nosuchcolumn').get('chr1'),
    'NC_000067.7',
  )
})

test('parseChromAlias: an empty file is an empty map, not a throw', () => {
  assert.equal(parseChromAlias('').size, 0)
})

test('pickGeneTrack: RefSeq Select wins, since that is the transcript we picked', () => {
  assert.equal(
    pickGeneTrack('hg38', [
      'hg38-rmsk',
      'hg38-ncbiRefSeq',
      'hg38-ncbiRefSeqCurated',
      'hg38-ncbiRefSeqSelect',
    ]),
    'hg38-ncbiRefSeqSelect',
  )
})

// Old and sparsely annotated assemblies carry no RefSeq track at all; a session
// with some gene track beats one with none.
test('pickGeneTrack: falls through to whatever gene set the assembly has', () => {
  assert.equal(
    pickGeneTrack('sacCer3', ['sacCer3-rmsk', 'sacCer3-sgdGene']),
    'sacCer3-sgdGene',
  )
  assert.equal(
    pickGeneTrack('GCF_000001215.4', [
      'GCF_000001215.4-repeatMasker',
      'GCF_000001215.4-ncbiGff',
    ]),
    'GCF_000001215.4-ncbiGff',
  )
})

// Track ids are prefixed by assembly, so another assembly's tracks must not
// match — a merged config carries several assemblies' worth.
test('pickGeneTrack: only this assembly counts, and none is undefined', () => {
  assert.equal(pickGeneTrack('hg38', ['mm39-ncbiRefSeqSelect']), undefined)
  assert.equal(pickGeneTrack('hg38', []), undefined)
})
