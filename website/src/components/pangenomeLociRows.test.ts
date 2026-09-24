import assert from 'node:assert'
import { test } from 'node:test'

import {
  HPRC_DATASET,
  HPRC_GRAPH_BROWSER,
  MOUSE_DATASET,
} from './pangenomeDataset.ts'
import { lociColumns, lociRows } from './pangenomeLociRows.ts'

import type { LaunchKind } from './pangenomeLinks.ts'
import type { LocusRow } from './pangenomeLociRows.ts'

const urlOf = (r: LocusRow | undefined, kind: LaunchKind) =>
  r?.launches.find(l => l.kind === kind)?.url

// Outside Vite the datasets declare no graphBrowser (the flag is off), so put
// it back where a test is about the graph column.
const hprcGraph = { ...HPRC_DATASET, graphBrowser: HPRC_GRAPH_BROWSER }

test('a curated row carries its description and a derived one its segments', () => {
  const [hprc] = lociRows(HPRC_DATASET)
  assert.equal(hprc?.description, 'Major histocompatibility complex')
  assert.equal(hprc?.segments, undefined)
  assert.equal(hprc?.variation, 'hyperdiversity, copy number')

  // The class II window every MHC launch opens, not the 5 Mb locus.
  assert.equal(hprc?.window, 'chr6:32,510,001-32,600,000')

  const [mouse] = lociRows(MOUSE_DATASET)
  assert.equal(mouse?.description, undefined)
  assert.ok(mouse?.segments && mouse.segments > 0)
})

test('an intergenic derived bubble is labelled as such, not by its coordinate', () => {
  const rows = lociRows(MOUSE_DATASET)
  const intergenic = rows.filter(r => r.gene === 'intergenic')
  assert.ok(intergenic.length > 0)
  assert.ok(rows.every(r => !r.gene.startsWith('chr')))
  assert.ok(rows.every(r => r.description === undefined && r.variation === ''))
  assert.ok(intergenic.every(r => urlOf(r, 'geneHub') === undefined))
})

test('a column no row fills is not drawn', () => {
  const hprc = lociColumns(lociRows(HPRC_DATASET))
  assert.equal(hprc.description, true)
  assert.equal(hprc.segments, false)

  const mouse = lociColumns(lociRows(MOUSE_DATASET))
  assert.equal(mouse.description, false)
  assert.equal(mouse.variation, false)
  assert.equal(mouse.segments, true)
})

test('the launch column follows what the build can open', () => {
  // Without a hosted graph HPRC still opens its callset; mouse has nothing.
  const hprc = lociRows(HPRC_DATASET)
  assert.ok(hprc.every(r => urlOf(r, 'graph') === undefined))
  assert.ok(hprc.every(r => urlOf(r, 'linear') !== undefined))
  assert.equal(lociColumns(lociRows(MOUSE_DATASET)).launches, true)
  assert.ok(
    lociRows(MOUSE_DATASET).every(r => urlOf(r, 'linear') === undefined),
  )

  // With one, every locus the graph does not collapse gets a graph link.
  const rows = lociRows(hprcGraph)
  const collapsed = new Set(
    hprcGraph.loci.filter(l => l.graphCollapsed).map(l => l.gene),
  )
  assert.ok(collapsed.size > 0)
  for (const r of rows) {
    assert.equal(urlOf(r, 'graph') === undefined, collapsed.has(r.gene), r.gene)
  }
})

test('a locus has a haplotypes launch exactly where its dataset has a panel', () => {
  const rows = lociRows(hprcGraph)
  const panels = hprcGraph.panels ?? {}
  hprcGraph.loci.forEach((locus, i) => {
    assert.equal(
      urlOf(rows[i], 'haplotypes') !== undefined,
      panels[locus.id] !== undefined,
      locus.id,
    )
  })
  assert.equal(lociColumns(rows).haplotypes, true)
  assert.equal(lociColumns(lociRows(HPRC_DATASET)).haplotypes, false)
  assert.equal(lociColumns(lociRows(MOUSE_DATASET)).haplotypes, false)
})

// One order for every row, and the gene hub, a page of this site, is the one
// launch that does not open a new tab.
test('a row lists its launches in one order, only those it can open', () => {
  const rows = lociRows(hprcGraph)
  const order: LaunchKind[] = ['graph', 'linear', 'haplotypes', 'geneHub']
  for (const r of rows) {
    const kinds = r.launches.map(l => l.kind)
    assert.deepEqual(
      kinds,
      order.filter(k => kinds.includes(k)),
    )
    assert.ok(
      r.launches.every(l => l.url && l.newTab === (l.kind !== 'geneHub')),
    )
  }
  assert.deepEqual(
    rows[0]?.launches.map(l => l.label),
    ['graph', 'variants', 'haplotypes', 'gene hub'],
  )
})
