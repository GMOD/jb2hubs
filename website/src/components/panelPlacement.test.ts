import assert from 'node:assert/strict'
import { test } from 'node:test'

import { placePanels } from './panelPlacement.ts'

const hbb = { loc: 'NC_000011.10:5125000-5329000', strand: -1 as const }
const hbbRat = { loc: 'NC_051336.1:158100000-158300000', strand: 1 as const }

test('a pair NCBI placed on both panels opens on both windows, without follow', () => {
  assert.deepEqual(
    placePanels([
      { window: hbb, symbol: 'HBB', searched: true },
      { window: hbbRat, symbol: 'Hbb-b1' },
    ]),
    {
      panels: [
        { loc: hbb.loc, placement: 'gene' },
        { loc: `${hbbRat.loc}[rev]`, placement: 'gene' },
      ],
    },
  )
})

test('a panel with no NCBI ortholog follows the searched gene', () => {
  assert.deepEqual(
    placePanels([{ window: hbb, symbol: 'HBB', searched: true }, {}]),
    {
      panels: [{ loc: hbb.loc, placement: 'gene' }, { placement: 'alignment' }],
      followAnchor: 0,
    },
  )
})

test('an ortholog NCBI did not place on the panel follows too, its symbol unused', () => {
  const plan = placePanels([
    { window: hbb, symbol: 'HBB', searched: true },
    { symbol: 'Hbb-b1' },
  ])
  assert.deepEqual(plan.panels[1], { placement: 'alignment' })
  assert.equal(plan.followAnchor, 0)
})

test('the searched gene anchors on its symbol when NCBI placed it nowhere here', () => {
  assert.deepEqual(placePanels([{ symbol: 'HBB', searched: true }, {}]), {
    panels: [{ loc: 'HBB', placement: 'symbol' }, { placement: 'alignment' }],
    followAnchor: 0,
  })
})

test('the searched gene can sit on the second panel, as after a swap', () => {
  assert.deepEqual(
    placePanels([{}, { window: hbb, symbol: 'HBB', searched: true }]),
    {
      panels: [{ placement: 'alignment' }, { loc: hbb.loc, placement: 'gene' }],
      followAnchor: 1,
    },
  )
})

test('with no gene there is nothing to anchor on, so nothing follows', () => {
  assert.deepEqual(placePanels([{}, {}]), {
    panels: [{ placement: 'none' }, { placement: 'none' }],
  })
})

test('an unplaced searched gene with no symbol hands the anchor to a placed ortholog', () => {
  assert.deepEqual(placePanels([{ searched: true }, { window: hbbRat }, {}]), {
    panels: [
      { placement: 'alignment' },
      { loc: hbbRat.loc, placement: 'gene' },
      { placement: 'alignment' },
    ],
    followAnchor: 1,
  })
})
