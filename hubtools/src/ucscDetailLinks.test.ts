import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import {
  absoluteUcscTemplate,
  parseUcscUrls,
  UCSC_LAUNCH_URL,
  ucscFormatDetails,
  ucscTemplateJexl,
} from './ucscDetailLinks.ts'

describe('absoluteUcscTemplate', () => {
  it('leaves an absolute template, or one that is a column value, alone', () => {
    for (const t of [
      'https://www.ncbi.nlm.nih.gov/nuccore/$$',
      'http://www.uniprot.org/uniprot/$$',
      '$$',
    ]) {
      assert.equal(absoluteUcscTemplate(t), t)
    }
  })

  it('sends hgTracks to the launch page, naming the db it was left to', () => {
    assert.equal(
      absoluteUcscTemplate('hgTracks?db=$D&position=$$'),
      `${UCSC_LAUNCH_URL}?db=$D&position=$$`,
    )
    assert.equal(
      absoluteUcscTemplate('../cgi-bin/hgTracks?db=$D&position=$$'),
      `${UCSC_LAUNCH_URL}?db=$D&position=$$`,
    )
    assert.equal(
      absoluteUcscTemplate('/cgi-bin/hgTracks?position=$$'),
      `${UCSC_LAUNCH_URL}?db=$D&position=$$`,
    )
  })

  it('sends any other cgi to genome.ucsc.edu', () => {
    assert.equal(
      absoluteUcscTemplate('../cgi-bin/hgGene?hgg_gene=%s'),
      'https://genome.ucsc.edu/cgi-bin/hgGene?hgg_gene=%s',
    )
    assert.equal(
      absoluteUcscTemplate('hgGeneGraph?db=hg38&gene=$$'),
      'https://genome.ucsc.edu/cgi-bin/hgGeneGraph?db=hg38&gene=$$',
    )
  })
})

describe('ucscTemplateJexl', () => {
  const ctx = { db: 'hg38', track: 't', id: 'ID', columns: true }

  it('refuses a variable a feature cannot supply', () => {
    assert.equal(ucscTemplateJexl('https://x/$n', ctx), undefined)
    assert.equal(ucscTemplateJexl('https://x/$taxId', ctx), undefined)
    assert.equal(
      ucscTemplateJexl('https://x/$<ref>', { ...ctx, columns: false }),
      undefined,
    )
  })

  it('writes the db and track in, and guards on what it reads', () => {
    assert.deepEqual(ucscTemplateJexl('https://x/$D/$T/$<geneSymbol>', ctx), {
      expr: "'https://x/'+'hg38'+'/'+'t'+'/'+feature.geneSymbol",
      guards: ['feature.geneSymbol'],
    })
  })

  it('escapes a quote the href would otherwise end at', () => {
    assert.equal(
      ucscTemplateJexl('https://x/"a"', ctx)?.expr,
      "'https://x/%22a%22'",
    )
  })
})

describe('parseUcscUrls', () => {
  it('reads quoted and bare templates', () => {
    assert.deepEqual(
      parseUcscUrls(
        'geneIds=https://www.ncbi.nlm.nih.gov/gene/$$ pmids="https://www.ncbi.nlm.nih.gov/pubmed/$$"',
      ),
      [
        ['geneIds', 'https://www.ncbi.nlm.nih.gov/gene/$$'],
        ['pmids', 'https://www.ncbi.nlm.nih.gov/pubmed/$$'],
      ],
    )
  })
})

describe('ucscFormatDetails', () => {
  const bigBed = { type: 'BigBedAdapter' }
  const ucsc = {
    track: 'x',
    url: 'https://www.ncbi.nlm.nih.gov/nuccore/$$',
    urls: 'geneId="https://www.ncbi.nlm.nih.gov/gene/$$"',
  }

  it('writes no links without a db, which is every GenArk config', () => {
    assert.equal(ucscFormatDetails(ucsc, bigBed), undefined)
  })

  it('writes no links on a GFF3 track, whose name is the gene', () => {
    assert.equal(
      ucscFormatDetails(ucsc, { type: 'Gff3TabixAdapter' }, 'hg38'),
      undefined,
    )
  })

  it('links the feature on a plain bigBed', () => {
    const f = ucscFormatDetails(ucsc, bigBed, 'hg38')
    assert.match(f?.feature ?? '', /^jexl:\{'Outside Link':.*,'geneId':/)
    assert.equal(f && 'subfeatures' in f, false)
  })

  it('links the transcripts of a track the adapter groups into genes', () => {
    const f = ucscFormatDetails(
      ucsc,
      { ...bigBed, aggregateField: 'name2' },
      'hg38',
    )
    assert.equal(f && 'feature' in f, false)
    assert.match(f?.subfeatures ?? '', /'geneId':/)
  })
})
