import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import {
  getTrackModifications,
  getUcscFeatureDisplay,
  mouseOverTemplateToJexl,
} from './getTrackModifications.ts'

describe('mouseOverTemplateToJexl', () => {
  it('converts $field and ${field} tokens', () => {
    assert.equal(
      mouseOverTemplateToJexl('<b>Pos</b>: $chrom:${chromStart}-${chromEnd}'),
      "jexl:'<b>Pos</b>: '+get(feature,'chrom')+':'+get(feature,'chromStart')+'-'+get(feature,'chromEnd')",
    )
  })

  it('keeps double quotes from href attributes intact', () => {
    assert.equal(
      mouseOverTemplateToJexl('<a href="x?a=${name}">${name}</a>'),
      "jexl:'<a href=\"x?a='+get(feature,'name')+'\">'+get(feature,'name')+'</a>'",
    )
  })

  it('handles adjacent tokens with no literal between', () => {
    assert.equal(
      mouseOverTemplateToJexl('$ref$alt'),
      "jexl:get(feature,'ref')+get(feature,'alt')",
    )
  })

  it('escapes single quotes in literal text', () => {
    assert.equal(
      mouseOverTemplateToJexl("it's $x"),
      "jexl:'it\\'s '+get(feature,'x')",
    )
  })

  it('returns a plain literal when there are no tokens', () => {
    assert.equal(mouseOverTemplateToJexl('no tokens'), "jexl:'no tokens'")
  })
})

describe('getUcscFeatureDisplay', () => {
  it('labels from defaultLabelFields (gnomAD _displayName)', () => {
    const d = getUcscFeatureDisplay('hg38-gnomad', {
      labelFields: 'rsId,_displayName',
      defaultLabelFields: '_displayName',
    })
    assert.equal(
      d.displays?.[0]?.renderer?.labels.name,
      "jexl:get(feature,'_displayName')",
    )
  })

  it('falls back to first labelFields when no default', () => {
    const d = getUcscFeatureDisplay('t', { labelFields: 'TFName' })
    assert.equal(
      d.displays?.[0]?.renderer?.labels.name,
      "jexl:get(feature,'TFName')",
    )
  })

  it('suppresses the label when defaultLabelFields is none', () => {
    const d = getUcscFeatureDisplay('t', {
      labelFields: 'name',
      defaultLabelFields: 'none',
    })
    assert.equal(d.displays?.[0]?.renderer?.labels.name, "jexl:''")
  })

  it('prefers a mouseOver template over mouseOverField', () => {
    const d = getUcscFeatureDisplay('t', {
      mouseOver: 'AF: ${AF}',
      mouseOverField: '_mouseOver',
    })
    assert.equal(d.displays?.[0]?.mouseover, "jexl:'AF: '+get(feature,'AF')")
  })

  it('uses mouseOverField when no template', () => {
    const d = getUcscFeatureDisplay('t', { mouseOverField: '_mouseOver' })
    assert.equal(d.displays?.[0]?.mouseover, "jexl:get(feature,'_mouseOver')")
  })

  it('returns no display when there are no relevant settings', () => {
    assert.deepEqual(getUcscFeatureDisplay('t', { track: 'foo' }), {})
  })
})

describe('getTrackModifications', () => {
  const baseTrack = {
    trackId: 'hg38-gnomadGenomesVariantsV4_1',
    type: 'FeatureTrack',
    name: 'gnomAD v4.1',
    assemblyNames: ['hg38'],
    metadata: {
      ucsc: {
        track: 'gnomadGenomesVariantsV4_1',
        defaultLabelFields: '_displayName',
      },
    },
  }

  it('attaches a display derived from UCSC settings for FeatureTracks', () => {
    const out = getTrackModifications(baseTrack)
    assert.equal(
      out?.displays?.[0]?.renderer?.labels.name,
      "jexl:get(feature,'_displayName')",
    )
  })

  it('does not attach a display to non-FeatureTracks', () => {
    const out = getTrackModifications({
      ...baseTrack,
      type: 'VariantTrack',
    })
    assert.equal(out?.displays, undefined)
  })
})
