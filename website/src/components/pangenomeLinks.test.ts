import assert from 'node:assert'
import { test } from 'node:test'

import { HPRC_DATASET } from './pangenomeDataset.ts'
import {
  crossSpeciesGeneOrderUrl,
  graphBrowserUrl,
  graphLocusUrl,
  graphVcfLgvUrl,
  referenceSyntenyUrl,
} from './pangenomeLinks.ts'
import {
  MAX_GRAPH_WINDOW_BP,
  PANGENOME_LOCI,
  locusRegion,
} from './pangenomeLoci.ts'

// A JBrowse launch URL is `<base>?config=<enc>&session=spec-<enc(json)>`. Decode
// both back so the tests assert on the real spec the browser will expand.
function parseLaunch(url: string) {
  const { searchParams } = new URL(url)
  const session = searchParams.get('session') ?? ''
  assert.ok(session.startsWith('spec-'), 'session is a spec- payload')
  return {
    config: searchParams.get('config') ?? '',
    spec: JSON.parse(session.slice('spec-'.length)) as {
      views: Record<string, unknown>[]
      sessionTracks?: Record<string, unknown>[]
    },
  }
}

const locus = HPRC_DATASET.loci.find(l => l.id === 'mhc-hla')!

test('graphVcfLgvUrl opens the reference LGV at the locus with graph + SV tracks', () => {
  const { config, spec } = parseLaunch(graphVcfLgvUrl(HPRC_DATASET, locus))
  assert.equal(config, HPRC_DATASET.reference.configUrl)

  const view = spec.views[0]!
  assert.equal(view.type, 'LinearGenomeView')
  assert.equal(view.assembly, HPRC_DATASET.reference.assembly)
  assert.equal(view.loc, locusRegion(locus))

  // Reference genes, the graph VCF, then every SV track — in that order.
  assert.deepEqual(view.tracks, [
    HPRC_DATASET.reference.geneTrackId,
    HPRC_DATASET.graphVcf.trackId,
    ...HPRC_DATASET.svTrackIds,
  ])

  // The graph VCF isn't in the hosted config, so it must ride along as a session
  // track pointing at the real data URL.
  const inlined = spec.sessionTracks?.[0]
  assert.equal(inlined?.trackId, HPRC_DATASET.graphVcf.trackId)
  assert.deepEqual(inlined?.adapter, {
    type: 'VcfTabixAdapter',
    uri: HPRC_DATASET.graphVcf.url,
  })
})

test('graphBrowserUrl lands on the dataset landing region', () => {
  const { spec } = parseLaunch(graphBrowserUrl(HPRC_DATASET))
  assert.equal(spec.views[0]!.loc, HPRC_DATASET.landingRegion)
})

test('referenceSyntenyUrl builds a reference↔target synteny view', () => {
  const target = HPRC_DATASET.syntenyTarget!
  const url = referenceSyntenyUrl(HPRC_DATASET, locus)
  if (url) {
    const { config, spec } = parseLaunch(url)

    // Merge config stitches the two assemblies together.
    assert.ok(config.includes(HPRC_DATASET.reference.assembly))
    assert.ok(config.includes(target.assembly))

    const view = spec.views[0]!
    assert.equal(view.type, 'LinearSyntenyView')
    assert.deepEqual(view.tracks, [target.trackId])
    assert.deepEqual(view.views, [
      { assembly: HPRC_DATASET.reference.assembly, loc: locusRegion(locus) },
      { assembly: target.assembly },
    ])
  } else {
    assert.fail('HPRC dataset has a synteny target, so a URL is produced')
  }
})

test('referenceSyntenyUrl is undefined when the dataset has no synteny target', () => {
  const noTarget = { ...HPRC_DATASET, syntenyTarget: undefined }
  assert.equal(referenceSyntenyUrl(noTarget, locus), undefined)
})

test('crossSpeciesGeneOrderUrl seeds the marker gene and reference taxon', () => {
  const url = crossSpeciesGeneOrderUrl(HPRC_DATASET, locus)
  const { searchParams } = new URL(url, 'https://example.org')
  // First pangene marker for MHC is HLA-A.
  assert.equal(searchParams.get('gene'), 'HLA-A')
  assert.equal(searchParams.get('ref'), String(HPRC_DATASET.reference.taxonId))
})

test('graphLocusUrl opens the graph on the locus, paired with a linear view', () => {
  const url = graphLocusUrl(HPRC_DATASET, locus)
  assert.ok(url, 'MHC has a graphWindow, so a URL is produced')
  const { config, spec } = parseLaunch(url)
  // the graph plugin is declared only in this config, never in the UCSC ones
  assert.equal(config, HPRC_DATASET.graphBrowser!.configUrl)

  const [lgv, graph] = spec.views
  assert.equal(lgv!.type, 'LinearGenomeView')
  assert.equal(graph!.type, 'GraphGenomeView')
  // the pairing that gives the two panels their hover sync
  assert.equal(graph!.connectedViewId, lgv!.id)
  assert.equal(graph!.loadedTrackId, HPRC_DATASET.graphBrowser!.segmentsTrackId)
  // the narrow graphWindow, not the 5 Mb display window the locus lists
  assert.deepEqual(graph!.loadedRegion, {
    refName: 'chr6',
    assemblyName: 'hg38',
    start: 32_500_000,
    end: 32_560_000,
  })
})

test('graphLocusUrl is undefined without a hosted graph', () => {
  const noGraph = { ...HPRC_DATASET, graphBrowser: undefined }
  assert.equal(graphLocusUrl(noGraph, locus), undefined)
})

test('every locus either draws a window a graph can hold, or none at all', () => {
  for (const l of PANGENOME_LOCI) {
    const url = graphLocusUrl(HPRC_DATASET, l)
    if (url) {
      const { spec } = parseLaunch(url)
      const region = spec.views[1]!.loadedRegion as {
        start: number
        end: number
      }
      // A wide locus with no explicit graphWindow must produce no launch rather
      // than one that opens and draws an unreadable thread.
      assert.ok(
        region.end - region.start <= MAX_GRAPH_WINDOW_BP,
        `${l.id} launches a ${region.end - region.start} bp graph window`,
      )
    }
  }
})
