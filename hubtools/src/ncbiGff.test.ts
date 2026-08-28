import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { addGeneOnlyDisplay, addNcbiGffTextSearching } from './ncbiGff.ts'
import { isRecord } from './util.ts'

import type { Track } from './types.ts'

const gff3 = (uri: string) => ({
  type: 'Gff3TabixAdapter',
  gffGzLocation: { uri },
})

// The two real shapes, taken from the built configs: a UCSC golden-path track
// carries no `displays` key at all, a GenArk one carries an empty array.
const ucsc = {
  trackId: 'hg38-ncbiRefSeqGff',
  type: 'FeatureTrack',
  adapter: gff3('hg38.gff.gz'),
}
const genark = {
  trackId: 'GCF_028858775.2-ncbiGff',
  type: 'FeatureTrack',
  adapter: gff3('GCF_028858775.2.gff.gz'),
  displays: [],
}

// A config read off disk is unknown all the way down (see the Track type), so
// walk into it rather than asserting a shape onto it.
function displaysOf(track: Track) {
  const { displays } = addGeneOnlyDisplay(track)
  assert.ok(Array.isArray(displays), 'expected a displays array')
  return displays.filter(isRecord)
}

describe('addGeneOnlyDisplay', () => {
  it('gives a UCSC NCBI GFF track a gene-only basic display', () => {
    const displays = displaysOf(ucsc)
    assert.equal(displays.length, 1)
    assert.deepEqual(displays[0], {
      type: 'LinearBasicDisplay',
      displayId: 'hg38-ncbiRefSeqGff-LinearBasicDisplay',
      showOnlyGenes: true,
    })
  })

  it('does the same for the GenArk spelling of the same file', () => {
    assert.equal(displaysOf(genark)[0]!.showOnlyGenes, true)
  })

  it('is idempotent, since enhanceConfig re-runs over its own output', () => {
    const once = addGeneOnlyDisplay(ucsc)
    assert.deepEqual(addGeneOnlyDisplay(once), once)
  })

  it('sets the slot on a display the deriver already wrote, rather than a second entry', () => {
    // deriveFeatureDisplay writes `<trackId>-LinearBasicDisplay` with labels and
    // mouseover on it; two entries with the same displayId would be a config
    // error, and a second entry ahead of it would drop that work.
    const derived = {
      ...ucsc,
      displays: [
        {
          type: 'LinearBasicDisplay',
          displayId: 'hg38-ncbiRefSeqGff-LinearBasicDisplay',
          mouseover: "jexl:get(feature,'name')",
        },
      ],
    }
    const displays = displaysOf(derived)
    assert.equal(displays.length, 1)
    assert.equal(displays[0]!.mouseover, "jexl:get(feature,'name')")
    assert.equal(displays[0]!.showOnlyGenes, true)
  })

  it('keeps a hand-authored extra display, and stays ahead of it', () => {
    const displays = displaysOf({
      ...ucsc,
      displays: [{ type: 'LinearArcDisplay', displayId: 'x' }],
    })
    assert.deepEqual(
      displays.map(d => d.type),
      ['LinearBasicDisplay', 'LinearArcDisplay'],
    )
  })

  it('leaves every other track alone', () => {
    for (const track of [
      // UCSC's genePred-derived bigBed of the same annotation: it draws gene
      // models only, so there is nothing to hide, and hiding by type would drop
      // the whole track.
      {
        trackId: 'GCF_028858775.2-ncbiRefSeq',
        type: 'FeatureTrack',
        adapter: { type: 'BigBedAdapter', bigBedLocation: { uri: 'x.bb' } },
      },
      // a GFF3 that is not the NCBI one
      {
        trackId: 'hg38-augustusGene',
        type: 'FeatureTrack',
        adapter: gff3('augustusGene.gff.gz'),
      },
      // the trackId matched as a substring rather than a whole segment
      {
        trackId: 'hg38-ncbiGffSomethingElse',
        type: 'FeatureTrack',
        adapter: gff3('x.gff.gz'),
      },
      { trackId: 'hg38-ncbiRefSeqGff', type: 'QuantitativeTrack' },
    ]) {
      assert.deepEqual(addGeneOnlyDisplay(track), track, track.trackId)
    }
  })
})

describe('addNcbiGffTextSearching', () => {
  function searchingOf(track: Track) {
    const { textSearching } = addNcbiGffTextSearching(track)
    assert.ok(isRecord(textSearching), 'expected a textSearching object')
    return textSearching
  }

  it('indexes names, not identifiers', () => {
    const t = searchingOf(ucsc)
    assert.deepEqual(t.indexingAttributes, ['Name', 'ID', 'gene_synonym'])
    // the three measured junk sources: a UUID per match, an MD5 per cDNA_match,
    // "biological region" as the Name of every biological_region
    for (const type of ['match', 'cDNA_match', 'biological_region']) {
      assert.ok(
        (t.indexingFeatureTypesToExclude as string[]).includes(type),
        type,
      )
    }
  })

  // Setting the slot REPLACES the CLI default rather than adding to it, so
  // dropping these two would put every exon and CDS back into the index.
  it('keeps the CLI default exclusions it is replacing', () => {
    const excluded = searchingOf(ucsc).indexingFeatureTypesToExclude as string[]
    assert.ok(excluded.includes('CDS'))
    assert.ok(excluded.includes('exon'))
  })

  // The allow list is the statement that survives NCBI adding a 116th type; the
  // deny list is what a released CLI can honor. They must not disagree, or the
  // index changes shape the day the CLI catches up.
  it('the deny list is a subset of what the allow list already drops', () => {
    const t = searchingOf(ucsc)
    const included = new Set(t.indexingFeatureTypesToInclude as string[])
    for (const type of t.indexingFeatureTypesToExclude as string[]) {
      assert.ok(!included.has(type), `${type} is on both lists`)
    }
  })

  it('the allow list carries the gene model, not just genes', () => {
    const included = new Set(
      searchingOf(ucsc).indexingFeatureTypesToInclude as string[],
    )
    for (const type of ['gene', 'pseudogene', 'mRNA', 'tRNA', 'lnc_RNA']) {
      assert.ok(included.has(type), type)
    }
  })

  // ensureTextSearchAdapters puts the trix adapter here; dropping it would
  // unhook the track from its own index.
  it('merges into an existing textSearching rather than replacing it', () => {
    const adapter = { type: 'TrixTextSearchAdapter', textSearchAdapterId: 'x' }
    const t = searchingOf({
      ...ucsc,
      textSearching: { textSearchAdapter: adapter },
    })
    assert.deepEqual(t.textSearchAdapter, adapter)
    assert.ok(Array.isArray(t.indexingAttributes))
  })

  it('is idempotent and leaves every other track alone', () => {
    const once = addNcbiGffTextSearching(genark)
    assert.deepEqual(addNcbiGffTextSearching(once), once)
    const bigBed = {
      trackId: 'GCF_028858775.2-ncbiRefSeq',
      type: 'FeatureTrack',
      adapter: { type: 'BigBedAdapter', bigBedLocation: { uri: 'x.bb' } },
    }
    assert.deepEqual(addNcbiGffTextSearching(bigBed), bigBed)
  })
})
