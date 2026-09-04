// The paths listUpstreamHubs.sh asks hgdownload to stat: hub.txt, the 2bit and
// the chrom.sizes for every accession that could plausibly have one, relative
// to the rsync daemon's hubs/ module. Candidates only -- whether a path exists
// is rsync's answer, not this file's, which is what keeps the report live
// rather than as old as its inputs.
//
// Three sources, unioned, because each is blind to something the others see:
//
//   genArkFileList.txt.gz  hgdownload's own manifest of every path under
//                          hubs/GCA and hubs/GCF. Regenerated daily, so it
//                          lags a hub added in the last day.
//   hubs/                  what we already publish, so a hub that went away
//                          upstream still gets an answer -- that absence is
//                          downloadHubs.ts's "gone upstream" finding.
//   hubJson/               the assembly list, so a hub UCSC began publishing
//                          today is fetched today rather than next run, and so
//                          the accessions it names that have never existed are
//                          reported on a stat rather than on absence from a
//                          listing.
import * as fs from 'fs'
import * as path from 'path'
import { fileURLToPath } from 'url'
import * as zlib from 'zlib'

import {
  type UCSCGenArkAssemblyEntry,
  accessionChunks,
  readJSON,
} from 'hubtools'

// Only a hub's own top-level hub.txt: the manifest also holds archived ones
// under <accession>/archive/ncbiGene/<date>/, which are not hubs we publish.
const HUB_TXT = /^GC[AF]\/\d{3}\/\d{3}\/\d{3}\/([^/]+)\/hub\.txt$/

export function manifestAccessions(text: string) {
  return text
    .split('\n')
    .map(line => HUB_TXT.exec(line)?.[1])
    .filter(accession => accession !== undefined)
}

// The accession directories four levels under hubs/GCA and hubs/GCF. Named
// rather than checked for a hub.txt: an extra candidate costs one stat, and a
// hub directory we have with no hub.txt is one we want an upstream answer for.
function localAccessions() {
  const accessions: string[] = []
  const descend = (dir: string, depth: number) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.isDirectory()) {
        if (depth === 3) {
          accessions.push(entry.name)
        } else {
          descend(path.join(dir, entry.name), depth + 1)
        }
      }
    }
  }
  for (const base of ['hubs/GCA', 'hubs/GCF']) {
    if (fs.existsSync(base)) {
      descend(base, 0)
    }
  }
  return accessions
}

// The same rule downloadHubs.ts reads an entry's accession by.
function assemblyListAccessions() {
  return fs.existsSync('hubJson')
    ? fs
        .readdirSync('hubJson')
        .filter(f => f.endsWith('.json'))
        .flatMap(
          f =>
            readJSON<{ data: UCSCGenArkAssemblyEntry[] }>(`hubJson/${f}`).data,
        )
        .map(({ ucscBrowser, refSeq, genBank }) => {
          const name = path.basename(ucscBrowser)
          return name.startsWith('GC') ? name : refSeq || genBank
        })
        .filter(accession => !!accession)
    : []
}

// hub.txt is the one whose size and mtime staleHubTxt.ts compares against the
// local copy; the other two are existence checks, since loadPre() fails the
// whole assembly without either of them.
export function candidatePaths(accessions: string[]) {
  const paths = new Set<string>()
  for (const accession of new Set(accessions)) {
    const chunks = accessionChunks(accession)
    if (chunks) {
      const { base, b1, b2, b3 } = chunks
      const dir = `${base}/${b1}/${b2}/${b3}/${accession}`
      paths.add(`${dir}/hub.txt`)
      paths.add(`${dir}/${accession}.2bit`)
      paths.add(`${dir}/${accession}.chrom.sizes.txt`)
    }
  }
  return [...paths].sort()
}

// import.meta.main is false under --experimental-strip-types, which is how
// deriveNcbiAccessions.ts silently emitted nothing for a month.
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const [manifest] = process.argv.slice(2)
  if (!manifest) {
    console.error('usage: upstreamHubCandidates.ts <genArkFileList.txt.gz>')
    process.exit(1)
  }
  const fromManifest = manifestAccessions(
    zlib.gunzipSync(fs.readFileSync(manifest)).toString(),
  )
  const fromLocal = localAccessions()
  const fromList = assemblyListAccessions()
  console.error(
    `candidates: ${fromManifest.length} in the manifest, ${fromLocal.length} local, ${fromList.length} in the assembly list`,
  )
  console.log(
    candidatePaths([...fromManifest, ...fromLocal, ...fromList]).join('\n'),
  )
}
