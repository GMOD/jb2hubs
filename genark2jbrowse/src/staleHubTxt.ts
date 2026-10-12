// Which hub.txt files differ from upstream, as paths relative to hgdownload's
// hubs/ module, for rsync --files-from. Reads listUpstreamHubs.sh's TSV;
// compares size and mtime, which is what rsync -t leaves on a file it copied,
// so the first run after a fresh checkout copies everything and later runs
// copy what moved. Also lists each file an existing hub.txt includes, which
// rsync copies only when its size or mtime differs. Hubs with no hub.txt yet
// are downloadHubs.ts's job.
import * as fs from 'fs'
import * as path from 'path'

import { includeNames } from 'hubtools'

import { getHubBasePath } from './util.ts'

const [listFile] = process.argv.slice(2)
if (!listFile) {
  console.error('usage: staleHubTxt.ts <upstream.tsv>')
  process.exit(1)
}

let existing = 0
let stale = 0
for (const line of fs.readFileSync(listFile, 'utf8').split('\n')) {
  const [accession, file, size, mtime] = line.split('\t')
  if (accession && file === 'hub.txt' && size && mtime) {
    const file = `${getHubBasePath(accession)}/hub.txt`
    if (fs.existsSync(file)) {
      existing++
      const stat = fs.statSync(file)
      const upstreamMs = new Date(mtime.replace(/\//g, '-')).getTime()
      if (
        process.env.REPROCESS ||
        stat.size !== Number(size) ||
        Math.abs(stat.mtimeMs - upstreamMs) >= 1000
      ) {
        stale++
        console.log(file.replace(/^hubs\//, ''))
      }
      for (const name of includeNames(fs.readFileSync(file, 'utf8'))) {
        console.log(
          path
            .join(path.dirname(file), path.basename(name))
            .replace(/^hubs\//, ''),
        )
      }
    }
  }
}
console.error(`hub.txt: ${stale} of ${existing} differ from upstream`)
