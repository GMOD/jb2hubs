import assert from 'node:assert'
import { test } from 'node:test'

import { gffAttribute, gffAttributes } from './pangenomeGff3.ts'

test('a written value reads back whole, reserved characters and all', () => {
  const column = gffAttributes([
    ['ID', 'a'],
    ['Note', 'x=1; y, z'],
    ['citation', ['P https://doi.org/1', 'Q']],
  ])
  assert.equal(
    column,
    'ID=a;Note=x%3D1%3B y%2C z;citation=P https://doi.org/1,Q',
  )
  assert.equal(gffAttribute(column, 'Note'), 'x=1; y, z')
  assert.equal(gffAttribute(column, 'citation'), 'P https://doi.org/1,Q')
})

test('an attribute is found first, in the middle or last, and only by its key', () => {
  const column = 'ID=g1.2;Parent=g1;transcript_id=g1.2;tag=MANE Select'
  assert.equal(gffAttribute(column, 'ID'), 'g1.2')
  assert.equal(gffAttribute(column, 'Parent'), 'g1')
  assert.equal(gffAttribute(column, 'tag'), 'MANE Select')
  assert.equal(gffAttribute(column, 'id'), undefined)
  assert.equal(gffAttribute(column, 'gene_name'), undefined)
  assert.equal(gffAttribute('transcript_id=t1;ID=x', 'ID'), 'x')
})

test("NCBI's escaped gene names read as written", () => {
  assert.equal(
    gffAttribute('ID=gene-AT1G44110;Name=CYCA2%3B3', 'Name'),
    'CYCA2;3',
  )
})
