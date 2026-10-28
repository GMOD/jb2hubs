import fs from 'fs'
import path from 'path'

import { isRecord, readGzHead } from 'hubtools'

import type { UcscTrack } from './types.ts'

export const ENRICHMENT_NOTE =
  "UCSC's table has no NCBI transcript attributes. Where a transcript's accession.version, span and exons match NCBI's GFF3 exactly, this track adds NCBI's feature type, tag (MANE Select, RefSeq Select), exception and transl_except. JBrowse picks a gene's representative isoform by that tag and translates selenocysteine through transl_except, so those transcripts can draw and translate differently than in the UCSC Genome Browser."

// Reads the `#!ncbi-*` lines genePredToGff.ts's enrichmentHeader writes.
export function parseEnrichmentHeader(text: string) {
  const fields = new Map<string, string>()
  for (const line of text.split('\n')) {
    if (!line.startsWith('#')) {
      break
    }
    const m = /^#!ncbi-([\w-]+)\s+(.*\S)/.exec(line)
    if (m) {
      fields.set(m[1]!, m[2]!)
    }
  }
  const matched = fields.get('matched-transcripts')
  return matched
    ? {
        ...(fields.has('annotation-source')
          ? { ncbiAnnotationSource: fields.get('annotation-source')! }
          : {}),
        ...(fields.has('annotation-date')
          ? { ncbiAnnotationDate: fields.get('annotation-date')! }
          : {}),
        matchedTranscripts: matched,
      }
    : undefined
}

/**
 * Says in a gene track's description and metadata that it carries NCBI's
 * attributes, when genePredToGff.ts enriched the file the track names.
 */
export function withEnrichmentNote(track: UcscTrack, dir: string): UcscTrack {
  const location = track.adapter.gffGzLocation
  const uri = isRecord(location) ? location.uri : undefined
  if (
    track.adapter.type !== 'Gff3TabixAdapter' ||
    typeof uri !== 'string' ||
    uri.includes('/') ||
    !fs.existsSync(path.join(dir, uri))
  ) {
    return track
  }
  const enrichment = parseEnrichmentHeader(readGzHead(path.join(dir, uri)))
  if (!enrichment) {
    return track
  }
  return {
    ...track,
    description: `${track.description ?? track.name} (differs from UCSC: NCBI's tags and transl_except added where transcripts match NCBI's annotation)`,
    metadata: {
      ...track.metadata,
      differsFromUcsc: { note: ENRICHMENT_NOTE, ...enrichment },
    },
  }
}
