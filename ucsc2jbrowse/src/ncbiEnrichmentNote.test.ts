import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { describe, it } from 'node:test'
import zlib from 'node:zlib'

import { enrichmentHeader } from './genePredToGff.ts'
import {
  ENRICHMENT_NOTE,
  parseEnrichmentHeader,
  withEnrichmentNote,
} from './ncbiEnrichmentNote.ts'

import type { UcscTrack } from './types.ts'

const annotation = {
  annotationSource: 'NCBI RefSeq GCF_000001405.40-RS_2025_08',
  annotationDate: '2025-08-01',
}

function gffTrack(uri: string): UcscTrack {
  return {
    type: 'FeatureTrack',
    trackId: 'hg38-ncbiRefSeq',
    name: 'NCBI RefSeq - RefSeq All',
    description: 'NCBI RefSeq genes, curated and predicted',
    assemblyNames: ['hg38'],
    adapter: { type: 'Gff3TabixAdapter', gffGzLocation: { uri } },
  }
}

function builtDir(files: Record<string, string>) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'enrichment-'))
  for (const [name, text] of Object.entries(files)) {
    fs.writeFileSync(path.join(dir, name), zlib.gzipSync(text))
  }
  return dir
}

describe('parseEnrichmentHeader', () => {
  it('reads back what genePredToGff writes', () => {
    const text = [
      '##gff-version 3',
      ...enrichmentHeader(annotation, 5, 7),
      'chr1\t...',
    ].join('\n')
    assert.deepEqual(parseEnrichmentHeader(text), {
      ncbiAnnotationSource: 'NCBI RefSeq GCF_000001405.40-RS_2025_08',
      ncbiAnnotationDate: '2025-08-01',
      matchedTranscripts: '5 of 7',
    })
  })

  it('finds nothing in a file the GFF never enriched', () => {
    assert.equal(parseEnrichmentHeader('##gff-version 3\nchr1\t...'), undefined)
  })
})

describe('withEnrichmentNote', () => {
  const dir = builtDir({
    'ncbiRefSeq.gff.gz': [
      '##gff-version 3',
      ...enrichmentHeader(annotation, 5, 7),
    ].join('\n'),
    'refGene.gff.gz': '##gff-version 3\n',
  })

  it('says how an enriched track differs from UCSC', () => {
    const track = withEnrichmentNote(gffTrack('ncbiRefSeq.gff.gz'), dir)
    assert.match(track.description!, /differs from UCSC/)
    assert.deepEqual(track.metadata?.differsFromUcsc, {
      note: ENRICHMENT_NOTE,
      ncbiAnnotationSource: 'NCBI RefSeq GCF_000001405.40-RS_2025_08',
      ncbiAnnotationDate: '2025-08-01',
      matchedTranscripts: '5 of 7',
    })
  })

  it('leaves a track whose file was not enriched alone', () => {
    const track = gffTrack('refGene.gff.gz')
    assert.deepEqual(withEnrichmentNote(track, dir), track)
  })

  it('leaves a track naming a remote file alone', () => {
    const track = gffTrack('https://example.org/ncbiRefSeq.gff.gz')
    assert.deepEqual(withEnrichmentNote(track, dir), track)
  })
})
