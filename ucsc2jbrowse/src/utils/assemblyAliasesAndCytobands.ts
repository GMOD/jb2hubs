import fs from 'fs'
import { gunzipSync } from 'node:zlib'
import path from 'path'

//
// refNameAliases and cytobands for golden-path assemblies are decided from the
// rsync'd database/ tables on disk, never from a live probe of hgdownload.
//
// The probe these replaced ran once per assembly under GNU parallel, and
// hgdownload drops connections under that concurrency (a burst of 40 loses
// ~40% of them). A dropped connection is indistinguishable from "UCSC has no
// alias file", so the assembly silently lost its refNameAliases and cytobands,
// and the trackDb-hash gate in make.sh meant it never got another chance —
// that is how hg19, panTro6 and susScr11 ended up published without aliases.
//
// database/chromAlias.txt.gz is a different file from the
// bigZips/<db>.chromAlias.txt the config points at, but the two track each
// other exactly: across all 238 built assemblies, every assembly with the local
// table has the bigZips file (44/44 of the ones missing aliases, 88/88 of the
// ones that had them) and every assembly without it 404s.
//

const bigZipsLink = (assemblyName: string, file: string) =>
  `https://hgdownload.soe.ucsc.edu/goldenPath/${assemblyName}/bigZips/${assemblyName}.${file}`

const databaseLink = (assemblyName: string, file: string) =>
  `https://hgdownload.soe.ucsc.edu/goldenPath/${assemblyName}/database/${file}`

export function getRefNameAliases(assemblyName: string, dbDir: string) {
  let ret = undefined
  if (fs.existsSync(path.join(dbDir, 'chromAlias.txt.gz'))) {
    ret = {
      adapter: {
        type: 'RefNameAliasAdapter',
        uri: bigZipsLink(assemblyName, 'chromAlias.txt'),
      },
    }
  }
  return ret
}

export function getCytobands(assemblyName: string, dbDir: string) {
  // Prefer cytoBand (curated banding); fall back to cytoBandIdeo. Whichever
  // resolves, drop it when every band is 'gneg' — a placeholder ideogram with no
  // real banding information, not worth wiring up as a cytobands adapter.
  let ret = undefined
  const file = ['cytoBand.txt.gz', 'cytoBandIdeo.txt.gz'].find(f =>
    fs.existsSync(path.join(dbDir, f)),
  )
  if (file) {
    const txt = new TextDecoder().decode(
      gunzipSync(fs.readFileSync(path.join(dbDir, file))),
    )
    const allGneg = txt
      .split('\n')
      .map(f => f.trim())
      .filter(f => !!f)
      .every(line => line.split('\t')[4] === 'gneg')
    if (!allGneg) {
      ret = {
        adapter: {
          type: 'CytobandAdapter',
          uri: databaseLink(assemblyName, file),
        },
      }
    }
  }
  return ret
}
