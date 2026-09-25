import fs from 'fs'
import { constants, gunzipSync } from 'zlib'

// NCBI writes which annotation a GFF3 holds, and when it was made, into the
// file's own header:
//
//   #!annotation-date 11/22/2025 09:42:57
//   #!annotation-source NCBI RefSeq GCF_020076305.1-RS_2025_11_22
//
// The track's metadata reads that header rather than ncbi.json, because the two
// drift apart. NCBI re-annotates at the same accession, ncbi.json is refreshed
// every 90 days, and a GFF is fetched again only once ncbi.json names a later
// release (genark2jbrowse/src/staleNcbiGffs.ts); on 2026-09-24, 103 of a
// 2,976-hub sample named a different RS_ release in the two, in both directions.
// The header describes the file we serve. A third of the sample has no such header (almost
// all "Annotation submitted by NCBI RefSeq" in ncbi.json), and those get no
// metadata rather than a claim we cannot check against the file.

// The #!annotation lines are the header's sixth and seventh, ahead of any
// ##sequence-region, so the first few KB always hold them. Reading 64 KB instead
// inflated ~200 KB a file and nearly tripled the 20 s GenArk config build.
const HEADER_BYTES = 1 << 13

export interface NcbiGffAnnotation {
  annotationSource?: string
  annotationDate?: string
}

// MM/DD/YYYY, as NCBI writes it, to ISO; anything else is passed through.
function isoDate(date: string) {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})\b/.exec(date)
  return m ? `${m[3]}-${m[1]}-${m[2]}` : date
}

export function parseNcbiGffAnnotation(text: string) {
  const annotation: NcbiGffAnnotation = {}
  for (const line of text.split('\n')) {
    if (!line.startsWith('#')) {
      break
    }
    const m = /^#!annotation-(source|date)\s+(.*\S)/.exec(line)
    if (m?.[1] === 'source') {
      annotation.annotationSource = m[2]
    } else if (m?.[1] === 'date') {
      annotation.annotationDate = isoDate(m[2]!)
    }
  }
  return annotation.annotationSource || annotation.annotationDate
    ? annotation
    : undefined
}

// Z_SYNC_FLUSH lets gunzip return what it has from input cut mid-member instead
// of throwing, so the read can stop anywhere in the first BGZF block.
export function readNcbiGffAnnotation(gffGzPath: string) {
  const fd = fs.openSync(gffGzPath, 'r')
  try {
    const buf = Buffer.alloc(HEADER_BYTES)
    const n = fs.readSync(fd, buf, 0, HEADER_BYTES, 0)
    const text = gunzipSync(buf.subarray(0, n), {
      finishFlush: constants.Z_SYNC_FLUSH,
    }).toString('utf8')
    return parseNcbiGffAnnotation(text)
  } finally {
    fs.closeSync(fd)
  }
}

// Where an annotation name says which release it is. RefSeq's current scheme
// dates each one (`GCF_000092205.1-RS_2026_07_03`), the one before it numbered
// them (`NCBI Bos taurus Annotation Release 106`), and every dated release is
// later than every numbered one. Anything else ("Annotation submitted by NCBI
// RefSeq", "FlyBase Release 6.54", "INSDC submitter") says nothing about order,
// and is what a superseded assembly's report reads: 9 of the 72 UCSC GFFs
// differ from their ncbi.json only that way.
function releaseRank(name: string): [number, number] | undefined {
  const dated = /-RS_(\d{4})_(\d{2})(?:_(\d{2}))?\b/.exec(name)
  if (dated) {
    return [2, Number(`${dated[1]}${dated[2]}${dated[3] ?? '00'}`)]
  }
  const numbered = /Annotation Release (\d+(?:\.\d+)?)/.exec(name)
  return numbered ? [1, Number(numbered[1])] : undefined
}

// Whether `published` names a later release than `served`, as far as the names
// can say; two names that cannot be ordered are not a newer release.
export function isLaterRelease(published: string, served: string) {
  const a = releaseRank(published)
  const b = releaseRank(served)
  return !!a && !!b && (a[0] === b[0] ? a[1] > b[1] : a[0] > b[0])
}
