import assert from 'node:assert'
import { test } from 'node:test'

import {
  assemblyNamesAgree,
  mapAccessionsToUcsc,
  ucscAccessions,
  ucscAssemblyName,
} from './ucscMapping.ts'

import type { MappableAssembly, UcscGenomeEntry } from './ucscMapping.ts'

function genome(
  description: string,
  taxId: number,
  sourceName?: string,
): UcscGenomeEntry {
  return { description, organism: '', scientificName: '', sourceName, taxId }
}

// Entries as src/list.json spells them.
const genomes: Record<string, UcscGenomeEntry> = {
  hg19: genome(
    'Feb. 2009 (GRCh37/hg19)',
    9606,
    'GRCh37 Genome Reference Consortium Human Reference 37 (GCA_000001405.1)',
  ),
  hg38: genome(
    'Dec. 2013 (GRCh38/hg38)',
    9606,
    'GRCh38 Genome Reference Consortium Human Reference 38 (GCA_000001405.15)',
  ),
  mm10: genome(
    'Dec. 2011 (GRCm38/mm10)',
    10090,
    'Genome Reference Consortium Mouse Build 38 (GCA_000001635.2)',
  ),
  mm39: genome(
    'Jun. 2020 (GRCm39/mm39)',
    10090,
    'Genome Reference Consortium Mouse Build 39 (GCA_000001635.9)',
  ),
  galGal5: genome(
    'Dec 2015 (Gallus_gallus-5.0/galGal5)',
    9031,
    'ICGC Gallus_gallus-5.0 (GCA_000002315.3)',
  ),
  galGal6: genome(
    'Mar. 2018 (GRCg6a/galGal6)',
    9031,
    'Genome Reference Consortium',
  ),
  susScr3: genome(
    'Aug. 2011 (SGSC Sscrofa10.2/susScr3)',
    9823,
    'SGSC Sscrofa10.2 (NCBI project 13421, GCA_000003025.4, WGS AEMK01)',
  ),
  susScr11: genome(
    'Feb. 2017 (Sscrofa11.1/susScr11)',
    9823,
    'The Swine Genome Sequencing Consortium (SGSC)',
  ),
  rn6: genome(
    'Jul. 2014 (RGSC 6.0/rn6)',
    10116,
    'RGSC Rnor_6.0 (GCA_000001895.4)',
  ),
  gorGor3: genome(
    'May 2011 (gorGor3.1/gorGor3)',
    9595,
    'Wellcome Trust Sanger Institute May 2011 (NCBI project 31265, GCA_000151905.1)',
  ),
  gorGor4: genome(
    'Dec 2014 (gorGor4.1/gorGor4)',
    9595,
    'Wellcome Trust Sanger Institute Dec 2014 (NCBI project 31265, GCA_000151905.1)',
  ),
  triMan1: genome(
    'Oct. 2011 (Broad v1.0/triMan1)',
    127582,
    'Broad Institute of MIT and Harvard TriManLat1.0 (GCA_000243295.1)',
  ),
  ARS_UCD2: genome(
    'Jul. 2023 (ARS-UCD2.0/GCF_002263795.3)',
    9913,
    'Hereford 2023 refseq (GCF_002263795.3)',
  ),
  bosTau9: genome('Apr. 2018 (ARS-UCD1.2/bosTau9)', 9913, 'USDA ARS'),
  mpxvRivers: genome(
    'MPXV-M5312_HM12_Rivers (MT903340.1/GCF_014621545.1)',
    10244,
    'Monkeypox virus',
  ),
}

function assembly(
  accession: string,
  ncbiAssemblyName: string,
  taxonId: number,
  pairedAccession?: string,
): MappableAssembly {
  return { accession, ncbiAssemblyName, pairedAccession, taxonId }
}

function mapOne(a: MappableAssembly) {
  return mapAccessionsToUcsc(genomes, [a]).get(a.accession)
}

test('the assembly name is what precedes the slash in the description', () => {
  assert.equal(ucscAssemblyName('Dec. 2013 (GRCh38/hg38)'), 'GRCh38')
  assert.equal(
    ucscAssemblyName('Aug. 2011 (SGSC Sscrofa10.2/susScr3)'),
    'SGSC Sscrofa10.2',
  )
  assert.equal(
    ucscAssemblyName('Jul. 2023 (ARS-UCD2.0/GCF_002263795.3)'),
    'ARS-UCD2.0',
  )
  assert.equal(ucscAssemblyName('Jan. 2020 (NC_045512.2)'), undefined)
})

test('accessions come from the sourceName and the description alike', () => {
  assert.deepEqual(ucscAccessions(genomes.mm39!), ['GCA_000001635.9'])
  assert.deepEqual(ucscAccessions(genomes.mpxvRivers!), ['GCF_014621545.1'])
  assert.deepEqual(ucscAccessions(genomes.galGal6!), [])
})

test('names agree past a submitter prefix, punctuation and a patch suffix', () => {
  assert.ok(assemblyNamesAgree('GRCh38', 'GRCh38.p14'))
  assert.ok(assemblyNamesAgree('SGSC Sscrofa10.2', 'Sscrofa10.2'))
  assert.ok(assemblyNamesAgree('ICGSC Felis_catus 6.2', 'Felis_catus-6.2'))
  assert.ok(!assemblyNamesAgree('GRCm39', 'GRCm38.p6'))
  assert.ok(!assemblyNamesAgree('Sscrofa11.1', 'Sscrofa10.2'))
})

test('a name with no digit or no letter never agrees', () => {
  assert.ok(!assemblyNamesAgree('Broad', 'Broad'))
  assert.ok(!assemblyNamesAgree('JGI 1.0', '1.0'))
})

test('an accession UCSC names maps to its entry', () => {
  assert.equal(
    mapOne(assembly('GCF_000001635.27', 'GRCm39', 10090, 'GCA_000001635.9')),
    'mm39',
  )
  assert.equal(
    mapOne(assembly('GCF_000001895.5', 'Rnor_6.0', 10116, 'GCA_000001895.4')),
    'rn6',
    'an exact accession needs no name agreement: RGSC 6.0 is Rnor_6.0',
  )
  assert.equal(
    mapOne(assembly('GCF_014621545.1', 'ASM1462154v1', 10244)),
    'mpxvRivers',
  )
})

// The bug this rule replaced: GRC reuses one accession base across major
// versions, and the newest claimant of the base was taken as the answer.
test('a shared accession base is not a match', () => {
  assert.equal(
    mapOne(assembly('GCF_000001635.26', 'GRCm38.p6', 10090, 'GCA_000001635.8')),
    'mm10',
  )
  assert.equal(
    mapOne(assembly('GCF_000002315.6', 'GRCg6a', 9031, 'GCA_000002315.5')),
    'galGal6',
  )
  assert.equal(
    mapOne(assembly('GCF_000003025.6', 'Sscrofa11.1', 9823, 'GCA_000003025.6')),
    'susScr11',
  )
  assert.equal(
    mapOne(assembly('GCF_002263795.2', 'ARS-UCD1.3', 9913, 'GCA_002263795.3')),
    undefined,
    'no entry is ARS-UCD1.3, so neither bosTau9 nor ARS-UCD2.0',
  )
})

test('a patch release maps to its major assembly', () => {
  assert.equal(
    mapOne(
      assembly('GCF_000001405.40', 'GRCh38.p14', 9606, 'GCA_000001405.29'),
    ),
    'hg38',
  )
})

test('an accession two entries claim is settled by name, or not at all', () => {
  assert.equal(
    mapOne(assembly('GCA_000151905.1', 'gorGor3.1', 9595)),
    'gorGor3',
  )
  assert.equal(
    mapOne(assembly('GCA_000151905.1', 'Kamilah_GGO_v0', 9595)),
    undefined,
  )
})

test('a name match must be within the same taxon', () => {
  assert.equal(
    mapOne(assembly('GCF_000190715.1', 'v1.0', 5786)),
    undefined,
    'triMan1 is "Broad v1.0", a manatee',
  )
})

test('an assembly without a name maps only by accession', () => {
  const nameless = { accession: 'GCF_000002315.6', taxonId: 9031 }
  assert.equal(mapAccessionsToUcsc(genomes, [nameless]).size, 0)
})
