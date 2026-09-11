import assert from 'node:assert'
import { test } from 'node:test'

import {
  graftLeaf,
  localAlign,
  parseStockholm,
  placeQuery,
  queryLabel,
  renameLeaf,
  rowResidueColumns,
} from './pfamSeed.ts'

const stockholm = `# STOCKHOLM 1.0
#=GF ID   Toy
#=GF AC   PF99999.1
#=GF DE   A toy domain
#=GS ROW1_HUMAN/10-17  AC P00001.2
#=GS ROW2_MOUSE/5-11   AC P00002.1
#=GS ROW3_FLY/1-7      AC Q00003.1

ROW1_HUMAN/10-17         ACDEF.GHK
ROW2_MOUSE/5-11          ACD-FaGH-
ROW3_FLY/1-7             -CDEF.GH-
#=GC seq_cons            ACDEF.GH.
//
`

test('parseStockholm: rows in order, gaps normalised, accessions off #=GS', () => {
  const seed = parseStockholm(stockholm)
  assert.strictEqual(seed.id, 'Toy')
  assert.strictEqual(seed.accession, 'PF99999.1')
  assert.strictEqual(seed.description, 'A toy domain')
  assert.deepStrictEqual(
    seed.rows.map(r => [r.name, r.aligned, r.accession]),
    [
      ['ROW1_HUMAN/10-17', 'ACDEF-GHK', 'P00001'],
      ['ROW2_MOUSE/5-11', 'ACD-FAGH-', 'P00002'],
      ['ROW3_FLY/1-7', '-CDEF-GH-', 'Q00003'],
    ],
  )
})

test('parseStockholm: blocks of the same row concatenate', () => {
  const seed = parseStockholm(
    'A/1-4  AC\nB/1-4  DE\n\nA/1-4  DE\nB/1-4  FG\n//\n',
  )
  assert.deepStrictEqual(
    seed.rows.map(r => r.aligned),
    ['ACDE', 'DEFG'],
  )
})

test('localAlign: identical sequences pair every residue', () => {
  const { pairs, score } = localAlign('ACDEFGHK', 'ACDEFGHK')
  assert.deepStrictEqual(
    pairs.map(([q]) => q),
    [0, 1, 2, 3, 4, 5, 6, 7],
  )
  assert.ok(score > 30)
})

test('localAlign: a domain inside a longer query is found where it sits', () => {
  const { pairs } = localAlign('MMMMMMACDEFGHKWWWW', 'ACDEFGHK')
  assert.deepStrictEqual(pairs[0], [6, 0])
  assert.deepStrictEqual(pairs.at(-1), [13, 7])
})

test('localAlign: a deletion in the query skips target residues, an insertion skips query ones', () => {
  // query lacks the target's E; the pairs jump over target index 3
  const del = localAlign('WWACDFGHKWW', 'ACDEFGHK').pairs
  assert.ok(del.some(([, t], i) => i > 0 && t - del[i - 1]![1] === 2))
  // query carries an extra residue the target lacks
  const ins = localAlign('ACDEPPFGHK', 'ACDEFGHK').pairs
  assert.ok(ins.some(([q], i) => i > 0 && q - ins[i - 1]![0] === 3))
})

test('placeQuery: the aligned segment is the query row, insertions as columns every other row gaps', () => {
  const seed = parseStockholm(stockholm)
  // N-flank MM, the domain with an insertion (PP after D), C-flank WW
  const placed = placeQuery('MMACDPPEFGHKWW', seed, {
    queryName: 'GENE',
    newick:
      '((ROW1_HUMAN/10-17:0.1,ROW2_MOUSE/5-11:0.2)0.9:0.3,ROW3_FLY/1-7:0.5);',
  })
  const lines = placed.fasta.split('\n')
  assert.strictEqual(lines[0], '>GENE/3-12')
  assert.deepStrictEqual(
    lines.filter(l => !l.startsWith('>')),
    [
      // A C D PP E F - G H K
      'ACDPPEF-GHK',
      'ACD--EF-GHK',
      'ACD---FAGH-',
      '-CD--EF-GH-',
    ],
  )
  assert.strictEqual(placed.queryName, 'GENE/3-12')
  assert.strictEqual(placed.anchor.name, 'ROW1_HUMAN/10-17')
  assert.strictEqual(placed.anchor.identity, 1)
  assert.deepStrictEqual(placed.domain, { start: 3, end: 12 })
  assert.strictEqual(placed.replaced, false)
  assert.strictEqual(placed.kept, 3)
  assert.strictEqual(
    placed.newick,
    '(((ROW1_HUMAN/10-17:0,GENE/3-12:0):0.1,ROW2_MOUSE/5-11:0.2)0.9:0.3,ROW3_FLY/1-7:0.5);',
  )
})

test('placeQuery: the query row ungapped is exactly the translation over `domain`', () => {
  const seed = parseStockholm(stockholm)
  const query = 'MMACDPPEFGHKWW'
  const placed = placeQuery(query, seed, { queryName: 'GENE' })
  const queryRow = placed.fasta.split('\n')[1]!
  assert.strictEqual(
    queryRow.replaceAll('-', ''),
    query.slice(placed.domain.start - 1, placed.domain.end),
  )
})

test('placeQuery: the seed row that IS the query is replaced, and its leaf renamed', () => {
  const seed = parseStockholm(stockholm)
  const placed = placeQuery('QQACDEFGHKQQ', seed, {
    queryName: 'GENE',
    uniprotId: 'P00001',
    newick:
      '((ROW1_HUMAN/10-17:0.1,ROW2_MOUSE/5-11:0.2):0.3,ROW3_FLY/1-7:0.5);',
  })
  assert.strictEqual(placed.replaced, true)
  assert.strictEqual(placed.kept, 2)
  // one row fewer is the replacement, not a budget
  assert.strictEqual(placed.thinned, false)
  assert.ok(!placed.fasta.includes('ROW1_HUMAN'))
  assert.strictEqual(
    placed.newick,
    '((GENE/3-10:0.1,ROW2_MOUSE/5-11:0.2):0.3,ROW3_FLY/1-7:0.5);',
  )
})

test('placeQuery: a window confines the search but coordinates stay on the whole query', () => {
  const seed = parseStockholm(stockholm)
  const query = 'ACDEFGHK' + 'X'.repeat(20) + 'ACDEFGHK'
  const placed = placeQuery(query, seed, {
    queryName: 'GENE',
    window: { start: 20, end: query.length },
  })
  assert.deepStrictEqual(placed.domain, { start: 29, end: 36 })
  assert.strictEqual(placed.queryName, 'GENE/29-36')
})

test('placeQuery: a budget keeps the anchor and the rows nearest the query, and drops the tree', () => {
  const seed = parseStockholm(stockholm)
  const placed = placeQuery('ACDEFGHK', seed, {
    queryName: 'GENE',
    newick:
      '((ROW1_HUMAN/10-17:0.1,ROW2_MOUSE/5-11:0.2):0.3,ROW3_FLY/1-7:0.5);',
    // room for 'GENE/1-8' (8 + 9 + 3) and two rows of ~28
    maxChars: 20 + 28 * 2 + 1,
  })
  assert.strictEqual(placed.kept, 2)
  assert.strictEqual(placed.total, 3)
  assert.strictEqual(placed.thinned, true)
  assert.ok(placed.fasta.includes('>ROW1_HUMAN/10-17'))
  assert.strictEqual(placed.newick, undefined)
})

test('placeQuery: nothing alignable throws rather than emitting an empty row', () => {
  const seed = parseStockholm(stockholm)
  assert.throws(() => placeQuery('PPPP', seed, { queryName: 'GENE' }), /align/)
})

test('placeQuery: an anchor the tree does not name leaves the tree out', () => {
  const seed = parseStockholm(stockholm)
  const placed = placeQuery('ACDEFGHK', seed, {
    queryName: 'GENE',
    newick: '(OTHER/1-2:0.1,ANOTHER/3-4:0.2);',
  })
  assert.strictEqual(placed.newick, undefined)
})

test('placeQuery: a query row name a seed row already has is kept distinct', () => {
  const seed = parseStockholm('GENE/1-8  ACDEFGHK\nB/1-8  ACDEFGHK\n//\n')
  const placed = placeQuery('ACDEFGHK', seed, { queryName: 'GENE' })
  assert.strictEqual(placed.queryName, 'GENE_query/1-8')
})

test('graftLeaf / renameLeaf: match whole leaf names only', () => {
  const tree = '(P53_HUMAN/99-289:0.1,P53_HUMAN/99-2890:0.2,X/1-2);'
  assert.strictEqual(
    graftLeaf(tree, 'P53_HUMAN/99-289', 'TP53/99-289'),
    '((P53_HUMAN/99-289:0,TP53/99-289:0):0.1,P53_HUMAN/99-2890:0.2,X/1-2);',
  )
  assert.strictEqual(
    renameLeaf(tree, 'X/1-2', 'GENE/1-2'),
    '(P53_HUMAN/99-289:0.1,P53_HUMAN/99-2890:0.2,GENE/1-2);',
  )
})

test('rowResidueColumns: gaps are skipped, other rows ignored', () => {
  const fasta = '>A/1-5\nAC-DE-F\n>B/1-7\nACDEFGH'
  assert.deepStrictEqual(rowResidueColumns(fasta, 'A/1-5', 3, 4), [3, 4])
  assert.deepStrictEqual(rowResidueColumns(fasta, 'A/1-5', 5, 5), [6])
  assert.deepStrictEqual(rowResidueColumns(fasta, 'B/1-7', 3, 4), [2, 3])
  assert.deepStrictEqual(rowResidueColumns(fasta, 'C', 1, 1), [])
})

test('queryLabel: a safe token', () => {
  assert.strictEqual(queryLabel('gene'), 'gene')
  assert.strictEqual(queryLabel('lin-12'), 'lin_12')
  assert.strictEqual(queryLabel('--'), 'QUERY')
})
