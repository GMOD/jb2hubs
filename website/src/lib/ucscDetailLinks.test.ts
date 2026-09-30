import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { stringToJexlExpression } from '@jbrowse/core/util/jexlStrings'
import { ucscFormatDetails } from 'hubtools'

import { ucscLaunchUrl } from './ucscLaunch.ts'

// What the details panel shows: the config's formatDetails evaluated by
// JBrowse's own jexl against the feature as the plain object the panel hands
// it. The values are real rows, read from hg38's bigBeds on 2026-09-30.
function details(
  ucsc: Record<string, unknown>,
  feature: Record<string, unknown>,
) {
  const f = ucscFormatDetails(ucsc, { type: 'BigBedAdapter' }, 'hg38')
  return stringToJexlExpression(f!.feature!).eval({ feature }) as Record<
    string,
    unknown
  >
}

const href = (html: unknown) => /href="([^"]*)"/.exec(String(html))?.[1]

describe('trackDb url', () => {
  it("links the item name under the track's label", () => {
    assert.deepEqual(
      details(
        {
          track: 'ucscToRefSeq',
          url: 'https://www.ncbi.nlm.nih.gov/nuccore/$$',
          urlLabel: 'RefSeq sequence:',
        },
        { name: 'NC_000001.11' },
      ),
      {
        'RefSeq sequence':
          '<a href="https://www.ncbi.nlm.nih.gov/nuccore/NC_000001.11">NC_000001.11</a>',
      },
    )
  })

  it('reads columns and coordinates, and links the label when the name is not used', () => {
    const d = details(
      {
        track: 'gnomadGenomesVariantsV4_1',
        url: 'https://gnomad.broadinstitute.org/variant/$s-$<_startPos>-$<ref>-$<alt>?dataset=gnomad_r4',
      },
      { refName: 'chr1', _startPos: 10001, ref: 'T', alt: 'C', name: 'x' },
    )
    assert.equal(
      d['Outside Link'],
      '<a href="https://gnomad.broadinstitute.org/variant/1-10001-T-C?dataset=gnomad_r4">Outside Link</a>',
    )
  })

  it('writes no row for a feature missing a column the link needs', () => {
    const d = details(
      {
        track: 'genCC',
        url: 'https://search.thegencc.org/genes/$<gene_curie>',
      },
      { name: 'x' },
    )
    assert.equal(d['Outside Link'], undefined)
  })

  it('splits a prefix:suffix name and reads the start', () => {
    assert.equal(
      href(
        details(
          {
            track: 'animalQtl',
            url: 'https://example.org/q?QTL_ID=$p&c=$S:${',
          },
          { name: 'QTL:12345', refName: 'chr2', start: 99 },
        )['Outside Link'],
      ),
      'https://example.org/q?QTL_ID=12345&c=chr2:99',
    )
  })
})

describe('trackDb urls', () => {
  const clinvar = {
    track: 'clinvarMain',
    urls: 'geneId="https://www.ncbi.nlm.nih.gov/gene/$$" snpId="https://www.ncbi.nlm.nih.gov/snp/$$"',
  }

  it('links a column, using the part after a | as the text', () => {
    assert.equal(
      details(clinvar, { geneId: '79501|OR4F5' }).geneId,
      '<a href="https://www.ncbi.nlm.nih.gov/gene/79501">OR4F5</a>',
    )
  })

  it('leaves a list, and an absent column, as they were', () => {
    const d = details(
      {
        track: 'unipMut',
        urls: 'pmids="https://www.ncbi.nlm.nih.gov/pubmed/$$"',
      },
      { pmids: '11230166,15489334' },
    )
    assert.equal(d.pmids, '11230166,15489334')
    assert.equal(details(clinvar, {}).snpId, undefined)
  })

  it('links a column that arrives as a number', () => {
    assert.equal(
      details(
        {
          track: 'panelAppGenes',
          urls: 'omimGene="https://www.omim.org/entry/$$"',
        },
        { omimGene: 616765 },
      ).omimGene,
      '<a href="https://www.omim.org/entry/616765">616765</a>',
    )
  })

  it("sends a relative hgTracks link to this site's config for the db", () => {
    const link = href(
      details(
        {
          track: 'gtexEqtlCaviar',
          urls: 'eqtlPos="hgTracks?db=$D&position=$$"',
        },
        { eqtlPos: 'chr1:666028-666028' },
      ).eqtlPos,
    )!
    assert.equal(
      ucscLaunchUrl(new URL(link).search, { hg38: ['hg38-ncbiRefSeq'] }),
      'https://jbrowse.org/code/jb2/main/?config=%2Fucsc%2Fhg38%2Fconfig.json&assembly=hg38&loc=chr1%3A666028-666028&tracks=hg38-ncbiRefSeq',
    )
  })
})
