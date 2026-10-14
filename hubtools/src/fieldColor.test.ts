import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { getUcscColorDisplay, parseItemRgbValues } from './fieldColor.ts'

// mm39-evaSnp8, ucsc2jbrowse/configs/mm39.json; every evaSnp* track carries it
const evaSnp = {
  itemRgb: 'on',
  'filterLabel.itemRgb': 'General variant types by color grouping',
  'filterValues.itemRgb':
    '255,,0,,0|Protein-altering and splice variants,0,,128,,0|Synonymous variants,0,,0,,255|Non-coding transcripts or UTR variants,0,,0,,0|Intergenic and intronic variants',
}

describe('getUcscColorDisplay', () => {
  it('names each evaSnp color with its trackDb label', () => {
    assert.deepEqual(getUcscColorDisplay('mm39-evaSnp8', evaSnp), {
      type: 'LinearBasicDisplay',
      displayId: 'mm39-evaSnp8-LinearBasicDisplay',
      color: {
        scale: 'identity',
        domain: ['rgb(255,0,0)', 'rgb(0,128,0)', 'rgb(0,0,255)', 'rgb(0,0,0)'],
        labels: [
          'Protein-altering and splice variants',
          'Synonymous variants',
          'Non-coding transcripts or UTR variants',
          'Intergenic and intronic variants',
        ],
        title: 'General variant types by color grouping',
      },
    })
  })

  it('needs itemRgb on', () => {
    assert.equal(
      getUcscColorDisplay('t', { ...evaSnp, itemRgb: 'off' }),
      undefined,
    )
    const { itemRgb: _, ...noItemRgb } = evaSnp
    assert.equal(getUcscColorDisplay('t', noItemRgb), undefined)
  })

  it('leaves out the title when trackDb has no filterLabel', () => {
    const { 'filterLabel.itemRgb': _, ...untitled } = evaSnp
    assert.equal(getUcscColorDisplay('t', untitled)?.color.title, undefined)
  })

  it('ignores a track with no filterValues.itemRgb', () => {
    assert.equal(getUcscColorDisplay('t', { itemRgb: 'on' }), undefined)
  })
})

describe('parseItemRgbValues', () => {
  it('reads a doubled comma in a label as a literal comma', () => {
    assert.deepEqual(parseItemRgbValues('1,,2,,3|Red,, mostly,4,,5,,6|Blue'), [
      { color: 'rgb(1,2,3)', label: 'Red, mostly' },
      { color: 'rgb(4,5,6)', label: 'Blue' },
    ])
  })

  it('refuses the whole setting when one entry is not a labelled color', () => {
    for (const setting of [
      '255,,0,,0|Red,0,,0,,255',
      '255,,0,,0|Red,0,,0|Two channels',
      '256,,0,,0|Out of range',
      'red|Not rgb',
      '255,,0,,0|',
      '',
    ]) {
      assert.equal(parseItemRgbValues(setting), undefined, setting)
    }
  })
})
