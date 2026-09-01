// Which hub.txt files differ from upstream, as paths relative to hgdownload's
// hubs/ module, for rsync --files-from. Reads listUpstreamHubs.sh's TSV;
// compares size and mtime, which is what rsync -t leaves on a file it copied,
// so the first run after a fresh checkout copies everything and later runs
// copy what moved. Hubs with no hub.txt yet are downloadHubs.ts's job.
import * as fs from 'fs'

import { getHubBasePath } from './util.ts'

const [listFile] = process.argv.slice(2)
if (!listFile) {
  console.error('usage: staleHubTxt.ts <upstream.tsv>')
  process.exit(1)
}

let existing = 0
let stale = 0
for (const line of fs.readFileSync(listFile, 'utf8').split('\n')) {
  const [accession, size, mtime] = line.split('\t')
  if (accession && size && mtime) {
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
    }
  }
}
console.error(`hub.txt: ${stale} of ${existing} differ from upstream`)
