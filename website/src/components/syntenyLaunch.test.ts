import assert from 'node:assert/strict'
import { test } from 'node:test'

import { createStore } from './orthologDb.ts'
import { planSyntenyLaunch } from './syntenyLaunch.ts'

import type { NcbiGene } from './geneSearch.ts'

const store = createStore({
  schema: 'ortholog-index/2',
  accessions: ['GCF_000001405.40', 'GCF_000001635.27'],
  ucscDb: { 'GCF_000001405.40': 'hg38', 'GCF_000001635.27': 'mm39' },
})

const placed = (
  gene_id: string,
  symbol: string,
  tax_id: string,
  assembly_accession: string,
  genomic_accession_version: string,
  begin: string,
  end: string,
  orientation: string,
): NcbiGene => ({
  gene_id,
  symbol,
  tax_id,
  annotations: [
    {
      assembly_accession,
      genomic_locations: [
        {
          genomic_accession_version,
          sequence_name: '',
          genomic_range: { begin, end, orientation },
        },
      ],
    },
  ],
})

const tp53 = placed(
  '7157',
  'TP53',
  '9606',
  'GCF_000001405.40',
  'NC_000017.11',
  '7668421',
  '7687490',
  'minus',
)
const trp53 = placed(
  '22059',
  'Trp53',
  '10090',
  'GCF_000001635.27',
  'NC_000077.7',
  '69471174',
  '69482699',
  'plus',
)

const hg38 = { id: 'hg38', taxonId: 9606, geneTrack: 'hg38-ncbiRefSeqGff' }
const mm39 = { id: 'mm39', taxonId: 10090, geneTrack: 'mm39-ncbiRefSeqGff' }

interface LaunchedView {
  views: { assembly: string; loc?: string; tracks?: string[] }[]
  tracks: string[]
  autoDiagonalize?: boolean
  navigation?: { follow: boolean; anchor: number }
}

function launchedView(url: string) {
  const spec = new URL(url).searchParams.get('session') ?? ''
  const session: { views: LaunchedView[] } = JSON.parse(
    spec.replace(/^spec-/, ''),
  )
  return session.views[0]!
}

test('no gene opens both whole genomes with no gene track, diagonalized', () => {
  const { url, alignedAssembly } = planSyntenyLaunch({
    assemblies: [hg38, mm39],
    trackId: 'hg38_to_mm39_liftOver',
  })
  const view = launchedView(url)
  assert.deepEqual(view.views, [{ assembly: 'hg38' }, { assembly: 'mm39' }])
  assert.deepEqual(view.tracks, ['hg38_to_mm39_liftOver'])
  assert.equal(view.autoDiagonalize, true)
  assert.equal(view.navigation, undefined)
  assert.equal(alignedAssembly, undefined)
  assert.match(
    new URL(url).searchParams.get('config') ?? '',
    /hubIds=hg38,mm39$/,
  )
})

test('a gene NCBI placed on both panels opens both windows, the partner flipped to its strand', () => {
  const { url, alignedAssembly } = planSyntenyLaunch({
    assemblies: [hg38, mm39],
    trackId: 'hg38_to_mm39_liftOver',
    symbol: 'TP53',
    resolved: { gene: tp53, ortholog: trp53, store },
  })
  const view = launchedView(url)
  assert.deepEqual(view.views, [
    {
      assembly: 'hg38',
      loc: 'NC_000017.11:7568421-7787490',
      tracks: ['hg38-ncbiRefSeqGff'],
    },
    {
      assembly: 'mm39',
      loc: 'NC_000077.7:69371174-69582699[rev]',
      tracks: ['mm39-ncbiRefSeqGff'],
    },
  ])
  assert.equal(view.autoDiagonalize, false)
  assert.equal(view.navigation, undefined)
  assert.equal(alignedAssembly, undefined)
})

test('after a swap the searched gene anchors the second panel', () => {
  const view = launchedView(
    planSyntenyLaunch({
      assemblies: [mm39, hg38],
      trackId: 'mm39_to_hg38_liftOver',
      symbol: 'TP53',
      resolved: { gene: tp53, ortholog: trp53, store },
    }).url,
  )
  assert.deepEqual(
    view.views.map(v => v.loc),
    ['NC_000077.7:69371174-69582699[rev]', 'NC_000017.11:7568421-7787490'],
  )
})

test('a partner with no NCBI ortholog follows the searched gene through the alignment', () => {
  const { url, alignedAssembly } = planSyntenyLaunch({
    assemblies: [hg38, mm39],
    trackId: 'hg38_to_mm39_liftOver',
    symbol: 'TP53',
    resolved: { gene: tp53, store },
  })
  const view = launchedView(url)
  assert.deepEqual(view.views, [
    {
      assembly: 'hg38',
      loc: 'NC_000017.11:7568421-7787490',
      tracks: ['hg38-ncbiRefSeqGff'],
    },
    { assembly: 'mm39', tracks: ['mm39-ncbiRefSeqGff'] },
  ])
  assert.deepEqual(view.navigation, { follow: true, anchor: 0 })
  assert.equal(view.autoDiagonalize, undefined)
  assert.equal(alignedAssembly, 'mm39')
})

test('a failed lookup anchors on the bare symbol and lets the partner follow', () => {
  const { url, alignedAssembly } = planSyntenyLaunch({
    assemblies: [hg38, mm39],
    trackId: 'hg38_to_mm39_liftOver',
    symbol: 'TP53',
  })
  const view = launchedView(url)
  assert.deepEqual(view.views, [
    { assembly: 'hg38', loc: 'TP53', tracks: ['hg38-ncbiRefSeqGff'] },
    { assembly: 'mm39', tracks: ['mm39-ncbiRefSeqGff'] },
  ])
  assert.deepEqual(view.navigation, { follow: true, anchor: 0 })
  assert.equal(alignedAssembly, 'mm39')
})

test('a genome without a gene track launches without a tracks field', () => {
  const view = launchedView(
    planSyntenyLaunch({
      assemblies: [hg38, { ...mm39, geneTrack: '' }],
      trackId: 'hg38_to_mm39_liftOver',
      symbol: 'TP53',
      resolved: { gene: tp53, ortholog: trp53, store },
    }).url,
  )
  assert.deepEqual(view.views[1], {
    assembly: 'mm39',
    loc: 'NC_000077.7:69371174-69582699[rev]',
  })
})
