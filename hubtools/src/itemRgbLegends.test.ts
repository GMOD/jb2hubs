import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { getUcscColorDisplay } from './fieldColor.ts'
import { UCSC_FIELD_PALETTES } from './fieldColorPalettes.ts'
import { UCSC_ITEM_RGB_LEGENDS, ucscItemRgbLegend } from './itemRgbLegends.ts'

describe('UCSC_ITEM_RGB_LEGENDS', () => {
  it('names each in-range color once, with a label', () => {
    for (const [track, { title, entries }] of Object.entries(
      UCSC_ITEM_RGB_LEGENDS,
    )) {
      assert.notEqual(title, '', track)
      assert.equal(new Set(entries.map(([rgb]) => rgb)).size, entries.length)
      for (const [rgb, label] of entries) {
        const channels = rgb.split(',')
        assert.ok(
          channels.length === 3 &&
            channels.every(c => /^\d{1,3}$/.test(c) && Number(c) <= 255),
          `${track} ${rgb}`,
        )
        assert.notEqual(label, '', `${track} ${rgb}`)
      }
    }
  })

  it('lists no track a field palette already paints', () => {
    for (const track of Object.keys(UCSC_ITEM_RGB_LEGENDS)) {
      assert.ok(!Object.hasOwn(UCSC_FIELD_PALETTES, track), track)
    }
  })
})

describe('ucscItemRgbLegend', () => {
  it('reads one legend for every sample of a per-sample family', () => {
    const legend = ucscItemRgbLegend('sgdpCopyNumber_LP6005441-DNA_A08')
    assert.equal(legend?.title, 'Copy number')
    assert.equal(ucscItemRgbLegend('sgdpCopyNumber_SS6004471'), legend)
  })

  it('matches a track name, not a property every object has', () => {
    assert.equal(ucscItemRgbLegend('constructor'), undefined)
    assert.equal(ucscItemRgbLegend('pliByGeneX'), undefined)
  })
})

describe('getUcscColorDisplay with a measured legend', () => {
  it('keys the colors through an identity scale', () => {
    const display = getUcscColorDisplay('hg38-mane', {
      track: 'mane',
      itemRgb: 'on',
    })
    assert.deepEqual(display?.encoding.color, {
      scale: {
        type: 'identity',
        domain: ['rgb(8,81,156)', 'rgb(222,45,38)'],
        names: ['MANE Select', 'MANE Plus Clinical'],
      },
      legend: { title: 'MANE status' },
    })
  })

  it('needs itemRgb on', () => {
    assert.equal(getUcscColorDisplay('hg38-mane', { track: 'mane' }), undefined)
  })

  it('yields to trackDb filterValues.itemRgb', () => {
    const display = getUcscColorDisplay('t', {
      track: 'mane',
      itemRgb: 'on',
      'filterValues.itemRgb': '1,,2,,3|Mine',
    })
    assert.deepEqual(display?.encoding.color, {
      scale: { type: 'identity', domain: ['rgb(1,2,3)'], names: ['Mine'] },
    })
  })
})
