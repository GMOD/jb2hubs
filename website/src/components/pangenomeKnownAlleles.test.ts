import assert from 'node:assert'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'

import { BOVINE_DATASET, PANGENOME_DATASETS } from './pangenomeDataset.ts'
import {
  drawnChangeOf,
  knownAllelesFile,
  knownAllelesGff3,
  knownAllelesTrack,
  knownAllelesUrl,
} from './pangenomeKnownAlleles.ts'

import type { SiteMark } from './pangenomeSvStates.ts'

test('each committed track is what its alleles write', () => {
  for (const d of PANGENOME_DATASETS) {
    assert.equal(
      readFileSync(knownAllelesFile(d), 'utf8'),
      knownAllelesGff3(d.knownAlleles),
      `${knownAllelesFile(d)} is stale: node generatePangenomeKnownAlleles.ts`,
    )
  }
})

test('every allele is on a graph sequence and cites a paper', () => {
  for (const d of PANGENOME_DATASETS) {
    const ids = d.knownAlleles.map(a => a.id)
    assert.equal(new Set(ids).size, ids.length, d.id)
    for (const a of d.knownAlleles) {
      assert.ok(
        d.graphBrowser.chromosomes.some(c => c.name === a.chrom),
        `${a.id}: ${a.chrom}`,
      )
      assert.ok(a.start < a.end, a.id)
      assert.ok(a.citations.length > 0, a.id)
      for (const c of a.citations) {
        assert.match(c.url, /^https:\/\//, a.id)
      }
    }
  }
})

test('the track sits beside the graph config, and only where an allele is', () => {
  assert.equal(
    knownAllelesUrl(BOVINE_DATASET),
    'https://jbrowse.org/pangenome/bovine-arsucd12/known-alleles.gff3',
  )
  assert.equal(
    knownAllelesFile(BOVINE_DATASET),
    'pangenome-config/bovine-arsucd12/known-alleles.gff3',
  )
  assert.equal(
    knownAllelesTrack(BOVINE_DATASET, {
      chrom: 'chr1',
      start: 2_428_400,
      end: 2_430_300,
    })?.adapter.uri,
    knownAllelesUrl(BOVINE_DATASET),
  )
  assert.equal(
    knownAllelesTrack(BOVINE_DATASET, { chrom: 'chr2', start: 0, end: 1000 }),
    undefined,
  )
})

const mark = (m: Partial<SiteMark>): SiteMark => ({
  site: 0,
  start: 0,
  end: 0,
  kind: 'insertion',
  bp: 0,
  ...m,
})

test('a mark is a known allele by place, direction and size', () => {
  const alleles = BOVINE_DATASET.knownAlleles
  const label = (m: SiteMark) => drawnChangeOf(m, alleles)?.drawn.label
  // the sidecar's Celtic polled record
  assert.equal(
    label(mark({ start: 2_429_328, end: 2_429_335, bp: 200 })),
    'Celtic polled',
  )
  // KIT's long and intermediate alleles stay apart
  const kit = { start: 70_052_678, end: 70_052_679 }
  assert.equal(label(mark({ ...kit, bp: 6900 })), 'KIT long (ancestral)')
  assert.equal(label(mark({ ...kit, bp: 6000 })), 'KIT intermediate')
  assert.equal(label(mark({ ...kit, bp: 4000 })), undefined)
  assert.equal(label(mark({ ...kit, kind: 'deletion', bp: 6900 })), undefined)
  assert.equal(
    label(
      mark({
        start: 63_639_811,
        end: 63_648_215,
        kind: 'replacement',
        gain: false,
        bp: 8350,
      }),
    ),
    'no L1-BT at ASIP',
  )
  assert.equal(
    label(mark({ start: 2_000_000, end: 2_000_001, bp: 200 })),
    undefined,
  )
})

test('a comma inside a value stays inside it', () => {
  const [, feature] = knownAllelesGff3([
    {
      id: 'a',
      name: 'A, B',
      chrom: 'chr1',
      start: 9,
      end: 20,
      about: 'x=1; y',
      inPanel: 'one',
      drawn: [],
      citations: [{ label: 'P', url: 'https://doi.org/1' }],
    },
  ]).split('\n')
  assert.equal(
    feature,
    'chr1\tjb2hubs\tsequence_alteration\t10\t20\t.\t.\t.\tID=a;Name=A%2C B;Note=x%3D1%3B y;in_panel=one;citation=P https://doi.org/1',
  )
})
