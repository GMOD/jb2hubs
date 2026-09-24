import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { entryHref, scoreEntry, scoreTerm } from './searchScoring.ts'

import type { IndexEntry } from '../hooks/useSearchIndex.ts'

interface EntryOverrides {
  accession?: string
  commonName?: string
  scientificName?: string
  assemblyName?: string
  assemblyStatus?: string
  source?: string
  taxonId?: number
  ncbiStatus?: number
  year?: number
  rank?: number
  altAccession?: string
  aliases?: string[]
}

function entry(o: EntryOverrides = {}) {
  const e: IndexEntry = [
    o.accession ?? '',
    o.commonName ?? '',
    o.scientificName ?? '',
    o.assemblyName ?? '',
    o.assemblyStatus ?? '',
    o.source ?? 'genark',
    o.taxonId ?? 0,
    o.ncbiStatus ?? 0,
    o.year ?? 0,
    o.rank ?? 0,
    o.altAccession ?? '',
    o.aliases ?? [],
  ]
  return e
}

describe('scoreTerm', () => {
  it('ranks prefix > word-boundary > substring > miss', () => {
    assert.equal(scoreTerm('hum', 'human'), 3)
    assert.equal(scoreTerm('sap', 'homo sapiens'), 2)
    assert.equal(scoreTerm('apien', 'homo sapiens'), 1)
    assert.equal(scoreTerm('xyz', 'homo sapiens'), 0)
  })
})

describe('scoreEntry', () => {
  it('returns -1 when not every term matches somewhere', () => {
    const e = entry({ commonName: 'human', scientificName: 'homo sapiens' })
    assert.equal(scoreEntry(e, ['human', 'zebrafish']), -1)
  })

  it('ranks a tighter common-name match above a longer one', () => {
    const human = entry({
      accession: 'GCF_1',
      commonName: 'human',
      scientificName: 'homo sapiens',
    })
    const hpv = entry({
      accession: 'GCF_2',
      commonName: 'human papillomavirus type 85',
      scientificName: 'alphapapillomavirus',
    })
    assert.ok(scoreEntry(human, ['human']) > scoreEntry(hpv, ['human']))
  })

  it('weights common name above assembly name', () => {
    const inName = entry({ commonName: 'foo' })
    const inAssembly = entry({ assemblyName: 'foo' })
    assert.ok(scoreEntry(inName, ['foo']) > scoreEntry(inAssembly, ['foo']))
  })

  it('applies reference-genome and ucsc tiebreakers', () => {
    const plain = entry({ commonName: 'human' })
    const reference = entry({ commonName: 'human', ncbiStatus: 1 })
    const ucsc = entry({ commonName: 'human', source: 'ucsc' })
    assert.ok(scoreEntry(reference, ['human']) > scoreEntry(plain, ['human']))
    assert.ok(scoreEntry(ucsc, ['human']) > scoreEntry(plain, ['human']))
  })

  it('ranks a newer assembly above a retired one for the same species', () => {
    const mm39 = entry({ commonName: 'Mouse', source: 'ucsc', year: 2020 })
    const mm7 = entry({ commonName: 'Mouse', source: 'ucsc', year: 2005 })
    assert.ok(scoreEntry(mm39, ['mouse']) > scoreEntry(mm7, ['mouse']))
  })

  it('ranks a curated assembly above a newer uncurated one', () => {
    // hg38 (2013, a UCSC browser) must beat an HPRC haplotype (2024, neither a
    // UCSC db nor an NCBI reference) for the query "human".
    const hg38 = entry({ commonName: 'Human', source: 'ucsc', year: 2013 })
    const haplotype = entry({
      commonName: 'human (HG00097 hap1 2024)',
      year: 2024,
    })
    assert.ok(scoreEntry(hg38, ['human']) > scoreEntry(haplotype, ['human']))
  })

  it('ranks a UCSC db above the GenArk reference of the same genome', () => {
    // The real rows, verbatim from searchIndex.json. "human" matches both
    // common names identically, so this is decided entirely on the tiebreakers
    // — and while UCSC and NCBI-reference were one flat band the newer GenArk
    // accession won on recency, putting the sparser browser first.
    const genark = entry({
      accession: 'GCF_000001405.40',
      commonName: 'human (GRCh38.p14 2022)',
      scientificName: 'Homo sapiens',
      assemblyName: 'GRCh38.p14',
      assemblyStatus: 'Chromosome',
      source: 'uncategorized',
      ncbiStatus: 1,
      year: 2022,
    })
    const hg38 = entry({
      accession: 'hg38',
      commonName: 'Human',
      scientificName: 'Homo sapiens',
      assemblyName: 'GRCh38',
      source: 'ucsc',
      year: 2013,
      rank: 2,
      altAccession: 'GCA_000001405.15',
    })
    assert.ok(scoreEntry(hg38, ['human']) > scoreEntry(genark, ['human']))
  })

  // The real rows, verbatim from searchIndex.json.
  const grch38p14 = entry({
    accession: 'GCF_000001405.40',
    commonName: 'human (GRCh38.p14 2022)',
    scientificName: 'Homo sapiens',
    assemblyName: 'GRCh38.p14',
    assemblyStatus: 'Chromosome',
    source: 'uncategorized',
    ncbiStatus: 1,
    year: 2022,
  })
  const hg38 = entry({
    accession: 'hg38',
    commonName: 'Human',
    scientificName: 'Homo sapiens',
    assemblyName: 'GRCh38',
    source: 'ucsc',
    year: 2013,
    rank: 2,
    altAccession: 'GCA_000001405.15',
  })

  it('scores the parenthetical of a GenArk common name as its assembly', () => {
    assert.ok(scoreEntry(hg38, ['grch38']) > scoreEntry(grch38p14, ['grch38']))
    const hs1 = entry({
      accession: 'hs1',
      commonName: 'Human',
      scientificName: 'Homo sapiens',
      assemblyName: 'T2T CHM13v2.0',
      source: 'ucsc',
      year: 2022,
      rank: 1,
      altAccession: 'GCA_009914755.4',
    })
    const goose = entry({
      accession: 'GCA_040182565.1',
      commonName: 'Swan (goose T2T HZ-2024a 2024)',
      scientificName: 'Anser cygnoides',
      assemblyName: 'Taihu_goose_T2T_genome',
      assemblyStatus: 'Chromosome',
      source: 'birds',
      ncbiStatus: 1,
      year: 2024,
    })
    assert.ok(scoreEntry(hs1, ['t2t']) > scoreEntry(goose, ['t2t']))
    // Still found by it, and by the year it carries.
    assert.ok(scoreEntry(goose, ['goose']) >= 0)
    assert.ok(scoreEntry(grch38p14, ['2022']) >= 0)
  })

  it('matches a borrowed name as a common name, without it being shown', () => {
    const dm6Fields = {
      accession: 'dm6',
      commonName: 'D. melanogaster',
      scientificName: 'Drosophila melanogaster',
      source: 'ucsc',
      year: 2014,
    }
    const dm6 = entry({ ...dm6Fields, aliases: ['fly D.melanogaster'] })
    const genark = entry({
      accession: 'GCF_000001215.4',
      commonName: 'fly D.melanogaster (Release 6 plus ISO1 MT 2014)',
      scientificName: 'Drosophila melanogaster',
      ncbiStatus: 1,
      year: 2014,
    })
    assert.equal(scoreEntry(entry(dm6Fields), ['fly']), -1)
    assert.ok(scoreEntry(dm6, ['fly']) > scoreEntry(genark, ['fly']))
    const ce11 = entry({
      commonName: 'C. elegans',
      source: 'ucsc',
      aliases: ['nematode C.elegans', 'roundworm'],
    })
    assert.ok(scoreEntry(ce11, ['worm']) >= 0)
  })

  it('breaks a same-year tie on UCSC preference order', () => {
    const first = entry({ commonName: 'Human', source: 'ucsc', rank: 1 })
    const second = entry({ commonName: 'Human', source: 'ucsc', rank: 2 })
    assert.ok(scoreEntry(first, ['human']) > scoreEntry(second, ['human']))
  })

  it('finds a ucsc db by either accession prefix', () => {
    // hg38's sourceName records the GenBank accession, but users paste the
    // RefSeq one at least as often.
    const hg38 = entry({
      accession: 'hg38',
      commonName: 'Human',
      source: 'ucsc',
      altAccession: 'GCA_000001405.15',
    })
    assert.ok(scoreEntry(hg38, ['gca_000001405']) >= 0)
    assert.ok(scoreEntry(hg38, ['gcf_000001405']) >= 0)
    assert.ok(scoreEntry(hg38, ['000001405']) >= 0)
    assert.equal(scoreEntry(hg38, ['gcf_999999999']), -1)
  })

  it('treats a bare accession prefix as no term at all', () => {
    const human = entry({ accession: 'GCF_000001405.40', commonName: 'human' })
    assert.equal(scoreEntry(human, ['gcf_']), -1)
    assert.equal(scoreEntry(entry({ commonName: 'zebrafish' }), ['gca_']), -1)
    assert.equal(
      scoreEntry(human, ['gcf_', 'human']),
      scoreEntry(human, ['human']),
    )
  })

  it('ranks the assembly whose accession equals the query above one it prefixes', () => {
    const hg19 = entry({
      accession: 'hg19',
      commonName: 'Human',
      source: 'ucsc',
      year: 2009,
      altAccession: 'GCA_000001405.1',
    })
    const hg38 = entry({
      accession: 'hg38',
      commonName: 'Human',
      source: 'ucsc',
      year: 2013,
      altAccession: 'GCA_000001405.15',
    })
    assert.ok(
      scoreEntry(hg19, ['gca_000001405.1']) >
        scoreEntry(hg38, ['gca_000001405.1']),
    )
    assert.ok(
      scoreEntry(hg38, ['gca_000001405.15']) >
        scoreEntry(hg19, ['gca_000001405.15']),
    )
  })
})

describe('entryHref', () => {
  it('routes ucsc entries to /ucsc and others to /accession', () => {
    assert.equal(
      entryHref(entry({ accession: 'hg38', source: 'ucsc' })),
      '/ucsc/hg38',
    )
    assert.equal(
      entryHref(entry({ accession: 'GCF_1', source: 'genark' })),
      '/accession/GCF_1',
    )
  })
})
