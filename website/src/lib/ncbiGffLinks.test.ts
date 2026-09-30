import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { stringToJexlExpression } from '@jbrowse/core/util/jexlStrings'
import { addNcbiGffLinks } from 'hubtools'

// The NCBI GFF track's links as the details panel evaluates them. The feature
// shapes are what v4.0.0 and main both hand the callback for dog's
// GCF_011100685.1, read back from a browser on 2026-09-30: lowercased
// attribute names, and Dbxref an array only when it has several entries.
const formatDetails = addNcbiGffLinks({
  trackId: 'GCF_011100685.1-ncbiGff',
  type: 'FeatureTrack',
  adapter: { type: 'Gff3TabixAdapter' },
}).formatDetails as { feature: string; subfeatures: string }

const evaluate = (expr: string, feature: Record<string, unknown>) =>
  stringToJexlExpression(expr).eval({ feature }) as Record<string, unknown>

describe('NCBI GFF links', () => {
  it("links the gene's GeneID and keeps the other cross-references", () => {
    assert.equal(
      evaluate(formatDetails.feature, {
        dbxref: ['GeneID:608690', 'VGNC:VGNC:44656'],
      }).dbxref,
      '<a href="https://www.ncbi.nlm.nih.gov/gene/608690">GeneID:608690</a>,VGNC:VGNC:44656',
    )
    assert.equal(
      evaluate(formatDetails.feature, { dbxref: 'GeneID:106783496' }).dbxref,
      '<a href="https://www.ncbi.nlm.nih.gov/gene/106783496">GeneID:106783496</a>',
    )
  })

  it('leaves a record without a GeneID as it was', () => {
    assert.equal(
      evaluate(formatDetails.feature, { dbxref: 'taxon:9615' }).dbxref,
      'taxon:9615',
    )
    assert.equal(evaluate(formatDetails.feature, {}).dbxref, undefined)
  })

  it("links a transcript's accession", () => {
    assert.equal(
      evaluate(formatDetails.subfeatures, { transcript_id: 'XM_038586688.1' })
        .transcript_id,
      '<a href="https://www.ncbi.nlm.nih.gov/nuccore/XM_038586688.1">XM_038586688.1</a>',
    )
    assert.equal(
      evaluate(formatDetails.subfeatures, {}).transcript_id,
      undefined,
    )
  })
})
