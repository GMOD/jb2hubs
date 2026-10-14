import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import {
  getUcscColorDisplay,
  parseItemRgbValues,
  ucscFieldColor,
} from './fieldColor.ts'
import { UCSC_FIELD_PALETTES } from './fieldColorPalettes.ts'

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

  it('refuses a run of three or more commas', () => {
    for (const setting of [
      '1,,2,,3|Red,,,4,,5,,6|Blue',
      '1,,2,,3|Red,,,,4,,5,,6|Blue',
      '1,,2,,3|Red,,,,,4,,5,,6|Blue',
      '1,,,2,,3|Red',
    ]) {
      assert.equal(parseItemRgbValues(setting), undefined, setting)
    }
  })

  it('refuses a label that starts or ends with a literal comma', () => {
    for (const setting of [
      '1,,2,,3|,,Red,4,,5,,6|Blue',
      '1,,2,,3|Red,,',
      '1,,2,,3|Red,, ,4,,5,,6|Blue',
    ]) {
      assert.equal(parseItemRgbValues(setting), undefined, setting)
    }
  })
})

// hg38-colorsDbSv, ucsc2jbrowse/configs/hg38.json
const colorsDbSv = {
  track: 'colorsDbSv',
  type: 'bigBed 9 +',
  itemRgb: 'on',
  'filterLabel.svType': 'SV Type',
  'filterType.svType': 'multipleListOr',
  'filterValues.svType': 'DEL,INS,INV,DUP',
}

// hg38-clinvarMain, ucsc2jbrowse/configs/hg38.json
const clinvarMain = {
  track: 'clinvarMain',
  type: 'bigBed 12 +',
  itemRgb: 'on',
  'filterType._clinSignCode': 'multiple',
  'filterValues._clinSignCode':
    'BN|benign,LB|likely benign,CF|conflicting,PG|pathogenic,LP|likely pathogenic,RF|risk factor,OT|other,VUS|vus',
}

describe('ucscFieldColor', () => {
  it('paints svType with the colors the long-read SV files carry', () => {
    assert.deepEqual(ucscFieldColor(colorsDbSv), {
      field: 'svType',
      scale: 'categorical',
      domain: [
        'DEL',
        'INS',
        'DUP',
        'INV',
        'CPX',
        'INSDEL',
        'MIXED',
        'BND',
        'TRA',
      ],
      range: [
        'rgb(200,0,0)',
        'rgb(0,0,200)',
        'rgb(0,160,0)',
        'rgb(230,140,0)',
        'rgb(140,0,200)',
        'rgb(100,100,150)',
        'rgb(120,120,120)',
        'rgb(90,90,90)',
        'rgb(90,90,90)',
      ],
      title: 'SV type',
    })
  })

  it('names coded values', () => {
    const color = ucscFieldColor(clinvarMain)
    assert.ok(color)
    assert.equal(color.field, '_clinSignCode')
    assert.deepEqual(color.domain.slice(0, 2), ['PG', 'LP'])
    assert.deepEqual(color.labels?.slice(0, 2), [
      'Pathogenic',
      'Likely pathogenic',
    ])
  })

  it('needs itemRgb on', () => {
    assert.equal(ucscFieldColor({ ...colorsDbSv, itemRgb: 'off' }), undefined)
    const { itemRgb: _, ...noItemRgb } = colorsDbSv
    assert.equal(ucscFieldColor(noItemRgb), undefined)
  })

  it('ignores a track nobody measured', () => {
    assert.equal(
      ucscFieldColor({ track: 'orphadata', itemRgb: 'on' }),
      undefined,
    )
  })

  it('lets trackDb filterValues.itemRgb name the colors when it does', () => {
    const color = getUcscColorDisplay('hg38-colorsDbSv', {
      ...colorsDbSv,
      'filterValues.itemRgb': '200,,0,,0|Deletion',
    })?.color
    assert.equal(color?.scale, 'identity')
  })
})

describe('UCSC_FIELD_PALETTES', () => {
  it('gives every value one rgb color, and a label to all or none', () => {
    for (const [track, { values }] of Object.entries(UCSC_FIELD_PALETTES)) {
      assert.equal(
        new Set(values.map(([value]) => value)).size,
        values.length,
        track,
      )
      for (const [, rgb] of values) {
        assert.ok(rgbOk(rgb), `${track} ${rgb}`)
      }
      const labelled = values.filter(([, , label]) => label !== undefined)
      assert.ok(
        labelled.length === 0 || labelled.length === values.length,
        track,
      )
    }
  })
})

function rgbOk(rgb: string) {
  const channels = rgb.split(',')
  return (
    channels.length === 3 &&
    channels.every(c => /^\d{1,3}$/.test(c) && Number(c) <= 255)
  )
}
