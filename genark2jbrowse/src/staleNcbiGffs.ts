// Prints, one per line, the gff/ downloads whose annotation NCBI has since
// replaced at the same url, for downloadNcbiGff.sh to fetch again.
//
// NCBI re-annotates an assembly in place (GCF_000092205.1-RS_2025_07_03 became
// -RS_2026_07_03 at the same *_genomic.gff.gz), and a GFF was fetched once, so
// nothing noticed: on 2026-09-24 1,049 of 44,648 served an older release than
// NCBI publishes. ncbi.json is refreshed every 90 days and names the current
// release, so comparing it with the GFF's own header finds them without a
// request. Only a provably later release counts (isLaterRelease), so
// a stale ncbi.json, or a superseded assembly whose report no longer names a
// release, asks NCBI for nothing.
import fs from 'fs'
import path from 'path'

import {
  accessionChunks,
  isLaterRelease,
  readJSON,
  readNcbiGffAnnotation,
} from 'hubtools'

import type { NCBIDatasetsResponse } from 'hubtools'

const GFF_DIR = 'gff'

function publishedRelease(accession: string) {
  const chunks = accessionChunks(accession)
  if (!chunks) {
    return undefined
  }
  const { base, b1, b2, b3 } = chunks
  const file = path.join('hubs', base, b1, b2, b3, accession, 'ncbi.json')
  try {
    return readJSON<NCBIDatasetsResponse>(file).reports.find(
      r => r.accession === accession,
    )?.annotation_info?.name
  } catch {
    return undefined
  }
}

let checked = 0
let unreadable = 0
const stale: string[] = []
for (const file of fs.readdirSync(GFF_DIR).sort()) {
  const accession = /^(GCF_\d+\.\d+)_.*_genomic\.gff\.gz$/.exec(file)?.[1]
  if (!accession) {
    continue
  }
  checked++
  let served
  try {
    served = readNcbiGffAnnotation(path.join(GFF_DIR, file))?.annotationSource
  } catch {
    unreadable++
    continue
  }
  const published = served ? publishedRelease(accession) : undefined
  if (served && published && isLaterRelease(published, served)) {
    stale.push(file)
    if (stale.length <= 5) {
      console.error(`  ${accession}: ${served} -> ${published}`)
    }
  }
}
for (const file of stale) {
  console.log(file)
}
console.error(
  `${stale.length} of ${checked} NCBI GFFs hold an older annotation release than NCBI now publishes` +
    (unreadable ? `; ${unreadable} would not decompress` : ''),
)
