import assert from 'node:assert'
import { test } from 'node:test'

import {
  HPRC_DATASET,
  HPRC_GRAPH_BROWSER,
  MOUSE_DATASET,
} from './pangenomeDataset.ts'
import { lociColumns, lociRows } from './pangenomeLociRows.ts'

// Outside Vite the datasets declare no graphBrowser (the flag is off), so put
// it back where a test is about the graph column.
const hprcGraph = { ...HPRC_DATASET, graphBrowser: HPRC_GRAPH_BROWSER }

test('a curated row carries its description and a derived one its segments', () => {
  const [hprc] = lociRows(HPRC_DATASET)
  assert.equal(hprc?.description, 'Major histocompatibility complex')
  assert.equal(hprc?.segments, undefined)
  assert.equal(hprc?.variation, 'hyperdiversity, copy number')

  const [mouse] = lociRows(MOUSE_DATASET)
  assert.equal(mouse?.description, undefined)
  assert.ok(mouse?.segments && mouse.segments > 0)
})

test('a column no row fills is not drawn', () => {
  const hprc = lociColumns(lociRows(HPRC_DATASET))
  assert.equal(hprc.description, true)
  assert.equal(hprc.segments, false)

  const mouse = lociColumns(lociRows(MOUSE_DATASET))
  assert.equal(mouse.description, false)
  assert.equal(mouse.segments, true)
})

test('the launch column follows what the build can open', () => {
  // Without a hosted graph HPRC still opens its callset; mouse has nothing.
  const hprc = lociRows(HPRC_DATASET)
  assert.ok(hprc.every(r => r.graphUrl === undefined))
  assert.ok(hprc.every(r => r.linearUrl !== undefined))
  assert.equal(lociColumns(lociRows(MOUSE_DATASET)).launches, true)
  assert.ok(lociRows(MOUSE_DATASET).every(r => r.linearUrl === undefined))

  // With one, every locus the graph does not collapse gets a graph link.
  const rows = lociRows(hprcGraph)
  const collapsed = new Set(
    hprcGraph.loci.filter(l => l.graphCollapsed).map(l => l.gene),
  )
  assert.ok(collapsed.size > 0)
  for (const r of rows) {
    assert.equal(r.graphUrl === undefined, collapsed.has(r.gene), r.gene)
  }
})
