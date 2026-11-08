import assert from 'node:assert'
import { test } from 'node:test'

import { catalogRows } from './pangenomeCatalogs.ts'
import {
  ARABIDOPSIS_DATASET,
  BOVINE_DATASET,
  HPRC_DATASET,
} from './pangenomeDataset.ts'

const narrow = { start: 196_740_000, end: 196_850_000 }

test('a narrow window opens its dataset catalogs, a wide one none', () => {
  const hprc = catalogRows(HPRC_DATASET, narrow)
  assert.deepEqual(
    hprc.sessionTracks.map(t => [t.trackId, t.assemblyNames]),
    [['hprc-gwas-catalog', ['hg38']]],
  )
  assert.deepEqual(hprc.tracks, [
    { trackId: 'hprc-gwas-catalog', type: 'LinearBasicDisplay', height: 60 },
  ])
  assert.deepEqual(
    catalogRows(BOVINE_DATASET, narrow).sessionTracks.map(t => t.trackId),
    ['bovine-omia-variants'],
  )
  assert.deepEqual(catalogRows(ARABIDOPSIS_DATASET, narrow).tracks, [])
  assert.deepEqual(
    catalogRows(HPRC_DATASET, { start: 0, end: 1_000_000 }).tracks,
    [],
  )
})

test('the GWAS Catalog names every column of its BED', () => {
  const [gwas] = catalogRows(HPRC_DATASET, narrow).sessionTracks
  const columns = gwas!.adapter.columnNames as string[]
  assert.equal(columns.length, 22)
  assert.deepEqual(columns.slice(0, 4), [
    'chrom',
    'chromStart',
    'chromEnd',
    'name',
  ])
  assert.ok(columns.includes('trait'))
})
