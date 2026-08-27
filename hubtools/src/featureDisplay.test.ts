import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import {
  getUcscFeatureDisplay,
  mouseOverTemplateToJexl,
  ucscDefaultFilters,
} from './featureDisplay.ts'

describe('mouseOverTemplateToJexl', () => {
  it('converts $field and ${field} tokens', () => {
    assert.equal(
      mouseOverTemplateToJexl('<b>Pos</b>: ${AF} $ref'),
      "jexl:`<b>Pos</b>: ${get(feature,'AF')} ${get(feature,'ref')}`",
    )
  })

  it('renames the standard BED columns to the adapter feature fields', () => {
    assert.equal(
      mouseOverTemplateToJexl('$chrom:${chromStart}-${chromEnd}'),
      "jexl:`${get(feature,'refName')}:${get(feature,'start')}-${get(feature,'end')}`",
    )
  })

  it('keeps double quotes from href attributes intact', () => {
    assert.equal(
      mouseOverTemplateToJexl('<a href="x?a=${name}">${name}</a>'),
      "jexl:`<a href=\"x?a=${get(feature,'name')}\">${get(feature,'name')}</a>`",
    )
  })

  it('handles adjacent tokens with no literal between', () => {
    assert.equal(
      mouseOverTemplateToJexl('$ref$alt'),
      "jexl:`${get(feature,'ref')}${get(feature,'alt')}`",
    )
  })

  it('leaves single quotes in literal text untouched', () => {
    assert.equal(
      mouseOverTemplateToJexl("it's $x"),
      "jexl:`it's ${get(feature,'x')}`",
    )
  })

  it('escapes backticks and non-token dollar signs in literal text', () => {
    assert.equal(
      mouseOverTemplateToJexl('$ a `b` $z'),
      "jexl:`\\$ a \\`b\\` ${get(feature,'z')}`",
    )
  })

  it('returns a template literal when there are no tokens', () => {
    assert.equal(mouseOverTemplateToJexl('no tokens'), 'jexl:`no tokens`')
  })
})

describe('getUcscFeatureDisplay', () => {
  it('labels from defaultLabelFields at the display level (gnomAD _displayName)', () => {
    const d = getUcscFeatureDisplay('hg38-gnomad', {
      labelFields: 'rsId,_displayName',
      defaultLabelFields: '_displayName',
    })
    assert.equal(
      d.displays?.[0]?.labels?.name,
      "jexl:get(feature,'_displayName')",
    )
  })

  it('falls back to first labelFields when no default (GenArk ncbiGene)', () => {
    const d = getUcscFeatureDisplay('t', { labelFields: 'geneName,geneName2' })
    assert.equal(d.displays?.[0]?.labels?.name, "jexl:get(feature,'geneName')")
  })

  // The label field IS the adapter's aggregateField on a bigGenePred, and
  // BigBedAdapter's synthesized gene parent carries none of the autoSql columns
  // -- only the aggregated value, as `name`. Naming the column labeled nothing.
  it('labels an aggregated bigGenePred by the parent name, not the column', () => {
    const d = getUcscFeatureDisplay('t', {
      type: 'bigGenePred',
      labelFields: 'geneName,geneName2',
      defaultLabelFields: 'geneName2',
    })
    assert.equal(d.displays?.[0]?.labels?.name, "jexl:get(feature,'name')")
  })

  it('keeps the none suppression on a bigGenePred', () => {
    const d = getUcscFeatureDisplay('t', {
      type: 'bigGenePred',
      defaultLabelFields: 'none',
    })
    assert.equal(d.displays?.[0]?.labels?.name, "jexl:''")
  })

  it('suppresses the label when defaultLabelFields is none', () => {
    const d = getUcscFeatureDisplay('t', {
      labelFields: 'name',
      defaultLabelFields: 'none',
    })
    assert.equal(d.displays?.[0]?.labels?.name, "jexl:''")
  })

  it('prefers a mouseOver template over mouseOverField', () => {
    const d = getUcscFeatureDisplay('t', {
      mouseOver: 'AF: ${AF}',
      mouseOverField: '_mouseOver',
    })
    assert.equal(d.displays?.[0]?.mouseover, "jexl:`AF: ${get(feature,'AF')}`")
  })

  it('uses mouseOverField when no template', () => {
    const d = getUcscFeatureDisplay('t', { mouseOverField: '_mouseOver' })
    assert.equal(d.displays?.[0]?.mouseover, "jexl:get(feature,'_mouseOver')")
  })

  it('emits no renderer block (new display-level shape)', () => {
    const d = getUcscFeatureDisplay('t', { defaultLabelFields: 'geneName2' })
    assert.equal('renderer' in (d.displays?.[0] ?? {}), false)
  })

  it('returns no display when there are no relevant settings', () => {
    assert.deepEqual(getUcscFeatureDisplay('t', { track: 'foo' }), {})
  })

  it('carries a derived filter, with the JBrowse default kept ahead of it', () => {
    const d = getUcscFeatureDisplay('t', {
      'filter.score': '400',
      'filterByRange.score': '0:1000',
    })
    assert.deepEqual(d.displays?.[0]?.jexlFilters, [
      "get(feature,'gbkey')!='Src'",
      "get(feature,'score') >= 400",
    ])
  })

  it('sets no jexlFilters when nothing was derived', () => {
    const d = getUcscFeatureDisplay('t', { defaultLabelFields: 'geneName2' })
    assert.equal('jexlFilters' in (d.displays?.[0] ?? {}), false)
  })
})

// The settings below are transcribed from hg38's own converted tracks (the
// trackIds are named), because the corpus is what decides whether a rule here is
// narrow enough: 70 hg38 tracks carry a `filter.*` and only a handful of them
// mean anything.
describe('ucscDefaultFilters', () => {
  it('reads a scalar cutoff as a minimum (hg38-jaspar2026)', () => {
    assert.deepEqual(
      ucscDefaultFilters({
        'filter.score': '400',
        'filterByRange.score': '0:1000',
      }),
      ["get(feature,'score') >= 400"],
    )
  })

  it('takes only the end of a range that differs from the limits (recount3)', () => {
    assert.deepEqual(
      ucscDefaultFilters({
        'filter.readcount': '10000:2000000000',
        'filterLimits.readcount': '0:2000000000',
        'filterByRange.readcount': 'on',
      }),
      ["get(feature,'readcount') >= 10000"],
    )
  })

  it('skips a default sitting at the full limits (hg38-clinvarCnv)', () => {
    assert.deepEqual(
      ucscDefaultFilters({
        'filter._varLen': '50:999999999',
        'filterLimits._varLen': '50:999999999',
        'filterByRange._varLen': 'on',
      }),
      [],
    )
  })

  it('skips a zero floor (hg38-clinvarMain, hg38-gnomad*)', () => {
    assert.deepEqual(
      ucscDefaultFilters({
        'filter.AF': '0.0',
        'filterByRange.AF': 'on',
      }),
      [],
    )
  })

  it('skips a bare range with no limits to compare against', () => {
    assert.deepEqual(
      ucscDefaultFilters({
        'filter.svLen': '0:101381',
        'filterByRange.svLen': 'on',
      }),
      [],
    )
  })

  it('skips a field UCSC does not range-filter (hg38-panelAppGenes)', () => {
    assert.deepEqual(ucscDefaultFilters({ 'filter.panelVersion': '1' }), [])
  })

  it('skips a categorical multi-select', () => {
    assert.deepEqual(
      ucscDefaultFilters({
        'filter.FILTER': 'PASS',
        'filterByRange.FILTER': 'on',
        'filterValues.FILTER': 'PASS,AC0',
      }),
      [],
    )
  })

  it('renames the three positional columns the adapter re-emits', () => {
    assert.deepEqual(
      ucscDefaultFilters({
        'filter.chromStart': '100',
        'filterByRange.chromStart': 'on',
      }),
      ["get(feature,'start') >= 100"],
    )
  })
})
