import assert from 'node:assert/strict'
import { test } from 'node:test'

import { subGroupMetadata } from './subGroups.ts'

test('subGroupMetadata labels a subgroup by its definition, or as written', () => {
  assert.deepEqual(
    subGroupMetadata({
      subGroup1: 'cell Cell_Line HeLa_S3=HeLa_S3',
      subGroup2: 'factor Factor',
      subGroups: 'cell=HeLa_S3 factor=CTCF unknown=x',
    }),
    { 'Cell Line': 'HeLa S3', Factor: 'CTCF' },
  )
  assert.deepEqual(subGroupMetadata({ subGroups: 'cell=K562' }), {})
  assert.deepEqual(subGroupMetadata({}), {})
})

test('subGroupMetadata reads a view and a tag whose label differs from its id', () => {
  assert.deepEqual(
    subGroupMetadata({
      subGroup1: 'view Views Signal=Signal Peaks=Peaks',
      subGroup2: 'cell Cell_Line K562=K562_(leukemia) GM12878=GM12878',
      subGroups: 'view=Signal cell=K562',
    }),
    { Views: 'Signal', 'Cell Line': 'K562 (leukemia)' },
  )
})
