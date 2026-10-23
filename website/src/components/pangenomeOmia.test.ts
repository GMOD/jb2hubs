import assert from 'node:assert'
import { test } from 'node:test'

import { hgvsSpan, omiaGff3, parseCsv } from './pangenomeOmia.ts'

test('a quoted field keeps its commas, quotes and newlines', () => {
  assert.deepEqual(parseCsv('a,"b, ""c""\nd",e\r\n1,2,3\n'), [
    ['a', 'b, "c"\nd', 'e'],
    ['1', '2', '3'],
  ])
})

test('a g. description spans every position it names', () => {
  assert.deepEqual(hgvsSpan('NC_037329.1:g.103030489T>C'), {
    start: 103_030_488,
    end: 103_030_489,
  })
  assert.deepEqual(hgvsSpan('g.36470764_36470767delinsT'), {
    start: 36_470_763,
    end: 36_470_767,
  })
  // the Celtic polled allele
  assert.deepEqual(
    hgvsSpan('NC_037328.1:g.[2429327_2429336del;2429109_2429320dupins]'),
    { start: 2_429_108, end: 2_429_336 },
  )
  assert.equal(hgvsSpan('g.(?_100)_(200_?)del'), undefined)
  assert.equal(hgvsSpan('g.100_101ins[NC_037328.1:g.5_9]'), undefined)
  assert.equal(hgvsSpan(''), undefined)
})

const HEADER =
  'OMIA Variant ID,OMIA Phene-Species ID(s),Species Name,Breed(s),Variant Phenotype,Gene,Allele,Variant Type,Variant Effect,Source of Genetic Variant,Pathogenicity Classification,Reference Sequence,Chr.,g. or m.,c. or n.,p.,Verbal Description,EVA ID,Inferred EVA ID,Year Published,PubMed ID(s),Acknowledgements'

test('a variant on ARS-UCD1.2 or 1.3 is placed, and one on 2.0 is not', () => {
  const csv = [
    HEADER,
    '1,OMIA 000483-9913,taurine cattle,Angus (Cattle),Polled,POLLED,,complex rearrangement,regulatory,Naturally occurring variant,,ARS-UCD1.3,1,"NC_037328.1:g.[2429327_2429336del;2429109_2429320dupins]",,,,,,2012,"22737241, 23717440",',
    '2,OMIA 002238-9913,taurine cattle,Shorthorn (Cattle),"Ichthyosis, ABCA12-related",ABCA12,,substitution,missense,,,ARS-UCD2.0,2,NC_037329.1:g.103016791A>G,,,,,,2019,31568573,',
    '3,OMIA 000001-9913,taurine cattle,,Thing,X,,,,,,ARS-UCD1.2,3,,,,,,,2020,,',
  ].join('\n')
  const { gff3, placed, skipped } = omiaGff3(csv)
  assert.equal(placed, 1)
  assert.deepEqual(skipped, { assembly: 1, position: 1 })
  const [feature] = gff3.split('\n').filter(l => l && !l.startsWith('#'))
  const [chrom, , , start, end, , , , attributes] = feature!.split('\t')
  assert.deepEqual([chrom, start, end], ['chr1', '2429109', '2429336'])
  assert.match(attributes!, /Name=POLLED Polled;/)
  assert.match(
    attributes!,
    /omia=OMIA 000483-9913 https:\/\/omia.org\/OMIA000483\/9913\//,
  )
  assert.match(
    attributes!,
    /pubmed=PMID 22737241 https:\/\/pubmed.ncbi.nlm.nih.gov\/22737241\/,PMID 23717440/,
  )
})
