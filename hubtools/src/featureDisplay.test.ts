import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import {
  getUcscFeatureDisplay,
  mouseOverTemplateToJexl,
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
})
