import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { addNcbiGffLabelDisplay, addNcbiGffTextSearching } from './ncbiGff.ts'
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
  const { displays } = addNcbiGffLabelDisplay(track)
  assert.ok(Array.isArray(displays), 'expected a displays array')
  return displays.filter(isRecord)
}

describe('addNcbiGffLabelDisplay', () => {
  it('gives a UCSC NCBI GFF track a basic display with the label chain', () => {
    const displays = displaysOf(ucsc)
    assert.equal(displays.length, 1)
    assert.equal(displays[0]!.type, 'LinearBasicDisplay')
    assert.equal(
      displays[0]!.displayId,
      'hg38-ncbiRefSeqGff-LinearBasicDisplay',
    )
    assert.equal(displays[0]!.showOnlyGenes, undefined)
  })

  it('does the same for the GenArk spelling of the same file', () => {
    assert.equal(displaysOf(genark)[0]!.showOnlyGenes, undefined)
  })

  it('is idempotent, since enhanceConfig re-runs over its own output', () => {
    const once = addNcbiGffLabelDisplay(ucsc)
    assert.deepEqual(addNcbiGffLabelDisplay(once), once)
  })

  it('sets labels/mouseover on a display the deriver already wrote, rather than a second entry', () => {
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
    // mouseover is one of the keys this DOES own, so it is replaced rather than
    // kept -- a hover showing a UUID beside a label reading "conserved
    // acetylation island" would be the worse outcome
    assert.match(displays[0]!.mouseover as string, /standard_name/)
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
      assert.deepEqual(addNcbiGffLabelDisplay(track), track, track.trackId)
    }
  })
})

describe('addNcbiGffLabelDisplay labels', () => {
  function labelOf(track: Track) {
    const { displays } = addNcbiGffLabelDisplay(track)
    assert.ok(Array.isArray(displays))
    const d = displays.find(isRecord)!
    assert.ok(isRecord(d.labels))
    return d.labels.name as string
  }

  // The trap this exists for: get(feature, key) folds the FILE's tag but
  // compares it against `key` verbatim, so `get(feature,'Target')` matches
  // nothing and returns undefined with NO error — the `||` chain simply moves
  // on. Measured in a browser on hg38: 'Target' labelled 0 of the window's 33
  // `match` records, 'target' labelled all 33.
  it('spells every attribute key lowercase', () => {
    const keys = [...labelOf(ucsc).matchAll(/get\(feature,'([^']+)'\)/g)].map(
      m => m[1]!,
    )
    assert.ok(keys.length > 4, 'expected a fallback chain')
    for (const k of keys) {
      assert.equal(k, k.toLowerCase(), k)
    }
  })

  // standard_name has to come before name: all 9,131 biological_region rows in a
  // human RefSeq GFF3 carry the same useless `Name=biological region`, while
  // their standard_name is the real description.
  it('prefers standard_name over name', () => {
    const label = labelOf(ucsc)
    assert.ok(label.indexOf("'standard_name'") < label.indexOf("'name'"), label)
  })

  // match and cDNA_match carry no Name, no gene and no Note at all -- only an
  // opaque ID and `Target=NG_004148.3 1 1144 +`, whose first token is the whole
  // content of the feature.
  it('falls back to the alignment target, which is all a match record has', () => {
    assert.match(
      labelOf(ucsc),
      /split\(get\(feature,'target'\)\|\|'',' '\)\[0\]$/,
    )
  })

  it('uses the same text for the hover, so the two cannot disagree', () => {
    const { displays } = addNcbiGffLabelDisplay(ucsc)
    const d = (displays as unknown[]).find(isRecord)!
    assert.equal(d.mouseover, (d.labels as { name: string }).name)
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

  // An allow list is the better statement, but no released reader has the slot:
  // core 4.3.0's baseTrackConfig does not declare it and @jbrowse/cli 4.2.1's
  // indexing-utils destructures only the exclude list and the attributes. 33
  // type names nothing reads, in 44,681 configs, is what that cost.
  it('writes only slots a released reader honors', () => {
    assert.deepEqual(Object.keys(searchingOf(ucsc)), [
      'indexingAttributes',
      'indexingFeatureTypesToExclude',
    ])
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
