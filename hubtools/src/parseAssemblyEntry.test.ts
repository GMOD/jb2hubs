import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { after, before, describe, it } from 'node:test'

import { parseAssemblyEntry } from './parseAssemblyEntry.ts'

import type { UCSCGenArkAssemblyEntry } from './types.ts'

const accession = 'GCF_002831045.2'
const entry = {
  taxId: 2048231,
  asmId: 'GCF_002831045.2_ViralProj417123',
  genBank: 'GCA_002831045.2',
  refSeq: accession,
  sciName: 'Example virus',
  comName: 'example virus',
  identical: false,
  ucscBrowser: `https://genome.ucsc.edu/h/${accession}`,
} satisfies UCSCGenArkAssemblyEntry

const ncbiJson = path.join(
  'hubs',
  'GCF',
  '002',
  '831',
  '045',
  accession,
  'ncbi.json',
)

describe('parseAssemblyEntry', () => {
  const cwd = process.cwd()
  before(() => {
    process.chdir(fs.mkdtempSync(path.join(os.tmpdir(), 'parse-entry-')))
    fs.mkdirSync(path.dirname(ncbiJson), { recursive: true })
  })
  after(() => {
    process.chdir(cwd)
  })

  it('lists a hub whose ncbi.json is an Entrez esummary, without its metadata', () => {
    fs.writeFileSync(
      ncbiJson,
      JSON.stringify({ header: { type: 'esummary' }, result: { uids: ['1'] } }),
    )
    const parsed = parseAssemblyEntry({ entry })
    assert.ok(parsed)
    assert.equal(parsed.accession, accession)
    assert.equal(parsed.ncbiAssemblyName, undefined)
  })

  it('reads a Datasets report', () => {
    fs.writeFileSync(
      ncbiJson,
      JSON.stringify({
        reports: [
          {
            accession,
            current_accession: accession,
            assembly_info: {
              assembly_level: 'Complete Genome',
              assembly_name: 'ViralProj417123',
              assembly_status: 'current',
              assembly_type: 'haploid',
              release_date: '2017-12-11',
            },
            organism: { organism_name: 'Example virus', tax_id: 2048231 },
            assembly_stats: {
              contig_l50: 1,
              contig_n50: 7000,
              scaffold_l50: 1,
              scaffold_n50: 7000,
              number_of_contigs: 1,
              number_of_scaffolds: 1,
              total_sequence_length: '7000',
              total_ungapped_length: '7000',
            },
          },
        ],
        downloaded_at: 1,
      }),
    )
    const parsed = parseAssemblyEntry({ entry })
    assert.ok(parsed)
    assert.equal(parsed.ncbiAssemblyName, 'ViralProj417123')
    assert.equal(parsed.ncbiDownloadedAt, 1)
  })
})
