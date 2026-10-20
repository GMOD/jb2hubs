import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import {
  accessionHead,
  countWithL50,
  hasAssemblyDetails,
  organismName,
  pairedLabel,
  retrievedDate,
  specimenSummary,
  syntenyName,
} from './accessionPage.ts'

import type { HeadFields } from './accessionPage.ts'

const human: HeadFields = {
  accession: 'GCF_000001405.40',
  scientificName: 'Homo sapiens',
  ncbiAssemblyName: 'GRCh38.p14',
  commonName: 'human (GRCh38.p14 2022)',
  taxonId: 9606,
  seqReleaseDate: '2022-02-03',
  submitterOrg: 'Genome Reference Consortium',
}

const abiotrophia: HeadFields = {
  accession: 'GCF_000160075.2',
  scientificName: 'Abiotrophia defectiva',
  ncbiAssemblyName: 'ASM16007v2',
  commonName: 'Abiotrophia defectiva (ATCC 49176 2009)',
  taxonId: 592010,
}

describe('organismName', () => {
  it('drops the assembly parenthetical', () => {
    assert.equal(organismName(human.commonName, human.scientificName), 'human')
  })

  it('is absent when what is left is the scientific name again', () => {
    assert.equal(
      organismName(abiotrophia.commonName, abiotrophia.scientificName),
      undefined,
    )
    assert.equal(
      organismName('homo Sapiens (x 2020)', 'Homo sapiens'),
      undefined,
      'ignoring case',
    )
  })

  it('is absent when there is no common name at all', () => {
    assert.equal(organismName('', 'Homo sapiens'), undefined)
  })
})

describe('accessionHead', () => {
  const url = 'https://genomes.jbrowse.org/accession/GCF_000001405.40/'

  it('names the organism in the description and JSON-LD', () => {
    const { title, description, jsonLd } = accessionHead(human, url)
    assert.equal(title, 'Homo sapiens — GRCh38.p14 GCF_000001405.40')
    assert.match(
      description,
      /^Homo sapiens \(human\) genome assembly GRCh38\.p14 GCF_000001405\.40\. /,
    )
    assert.equal(jsonLd.about.alternateName, 'human')
    assert.deepEqual(jsonLd.keywords, [
      'Homo sapiens',
      'human',
      'GCF_000001405.40',
      'GRCh38.p14',
    ])
    assert.equal(jsonLd.url, url)
    assert.equal(jsonLd.datePublished, '2022-02-03')
    assert.deepEqual(jsonLd.creator, {
      '@type': 'Organization',
      name: 'Genome Reference Consortium',
    })
  })

  it('does not repeat the scientific name as a common name', () => {
    const { organism, description, jsonLd } = accessionHead(abiotrophia, url)
    assert.equal(organism, undefined)
    assert.match(description, /^Abiotrophia defectiva genome assembly /)
    assert.equal('alternateName' in jsonLd.about, false)
    assert.equal(jsonLd.keywords.length, 3)
  })

  it('links NCBI by the datasets url, not the retired /assembly one', () => {
    const { jsonLd } = accessionHead(human, url)
    assert.equal(
      jsonLd.sameAs,
      'https://www.ncbi.nlm.nih.gov/datasets/genome/GCF_000001405.40/',
    )
    assert.equal(
      jsonLd.about.sameAs,
      'https://www.ncbi.nlm.nih.gov/datasets/taxonomy/9606/',
    )
  })

  it('leaves out a release date and submitter it does not have', () => {
    const { jsonLd } = accessionHead(abiotrophia, url)
    assert.equal('datePublished' in jsonLd, false)
    assert.equal('creator' in jsonLd, false)
  })
})

describe('specimenSummary', () => {
  it('joins the infraspecific names', () => {
    assert.equal(
      specimenSummary({ strain: 'C57BL/6J', sex: 'female' }),
      'strain: C57BL/6J, sex: female',
    )
  })

  it('is absent for none', () => {
    assert.equal(specimenSummary({}), undefined)
    assert.equal(specimenSummary(undefined), undefined)
  })
})

describe('hasAssemblyDetails', () => {
  it('is false with nothing to show', () => {
    assert.equal(hasAssemblyDetails({}, {}), false)
    assert.equal(
      hasAssemblyDetails({ gcPercent: 41, stats: { contig_n50: 5 } }, {}),
      false,
    )
    assert.equal(
      hasAssemblyDetails({ stats: {}, infraspecificNames: {} }, {}),
      false,
    )
  })

  it('is true for any one row the section renders', () => {
    assert.equal(hasAssemblyDetails({ stats: { contig_count: 5 } }, {}), true)
    assert.equal(hasAssemblyDetails({ sequencingTech: 'PacBio' }, {}), true)
    assert.equal(
      hasAssemblyDetails({ infraspecificNames: { strain: 'x' } }, {}),
      true,
    )
    assert.equal(
      hasAssemblyDetails({}, { pairedAccession: 'GCA_000001405.29' }),
      true,
    )
  })
})

describe('countWithL50', () => {
  it('appends the L50 when NCBI gives one', () => {
    assert.equal(countWithL50(35611, 18), '35,611, L50 18')
    assert.equal(countWithL50(470, undefined), '470')
  })
})

describe('pairedLabel', () => {
  it('names the other database', () => {
    assert.equal(pairedLabel('GCF_000001405.40'), 'Paired RefSeq')
    assert.equal(pairedLabel('GCA_000001405.29'), 'Paired GenBank')
  })
})

describe('syntenyName', () => {
  const listed = new Set(['hg38', 'GCA_000001405.29'])

  it('prefers the first listed name', () => {
    assert.equal(syntenyName(['hg38', 'GCF_000001405.40'], listed), 'hg38')
    assert.equal(
      syntenyName([undefined, 'GCA_000001405.29'], listed),
      'GCA_000001405.29',
    )
  })

  it('is absent when none is listed', () => {
    assert.equal(syntenyName([undefined, 'GCF_1'], listed), undefined)
  })
})

describe('retrievedDate', () => {
  // 2026-09-01T02:30Z is Aug 31 in the build host's Pacific time, which is the
  // day the page printed before the formatter was pinned to UTC.
  it('formats the UTC day', () => {
    assert.equal(
      retrievedDate(Date.UTC(2026, 8, 1, 2, 30) / 1000),
      'Sep 1, 2026',
    )
  })
})
