import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

import { linkOrCopy } from 'hubtools'

import type { FinalizeStep } from './utils/finalizeStep.ts'

// downloadGencode.sh fetches each url, sorts, bgzips and tabix-indexes it as
// <basename minus .gff3.gz>.sorted.gff3.gz here; this step then links the
// result into the built dir and adds the track.
const GENCODE_PROCESSED_DIR =
  process.env.GENCODE_PROCESSED_DIR ?? '/mnt/sdb/cdiesh/gencode_processed'

const HUMAN = 'https://ftp.ebi.ac.uk/pub/databases/gencode/Gencode_human'
const MOUSE = 'https://ftp.ebi.ac.uk/pub/databases/gencode/Gencode_mouse'

interface GencodeTrack {
  db: string
  url: string
  name: string
  trackId: string
}

export const GENCODE_TRACKS: GencodeTrack[] = [
  ...[
    ['annotation', 'Comprehensive gene annotation', 'Comp'],
    ['basic.annotation', 'Basic gene annotation', 'Basic'],
    ['long_noncoding_RNAs', 'lncRNA gene annotation', 'LncRNA'],
    ['polyAs', 'PolyA feature annotation', 'PolyA'],
    [
      '2wayconspseudos',
      'Consensus pseudogenes predicted by the Yale and UCSC pipelines',
      'Pseudo',
    ],
    ['tRNAs', 'Predicted tRNA genes', 'tRNA'],
    ['promoter_windows', 'Promoter Windows', 'Promoter'],
  ].map(([file, label, id]) => ({
    db: 'hg38',
    url: `${HUMAN}/release_49/gencode.v49.${file}.gff3.gz`,
    name: `GENCODE V49 - ${label}`,
    trackId: `hg38-gencode${id}`,
  })),
  ...[
    ['annotation', 'Comprehensive gene annotation', 'Comp'],
    ['basic.annotation', 'Basic gene annotation', 'Basic'],
    ['long_noncoding_RNAs', 'lncRNA gene annotation', 'LncRNA'],
  ].map(([file, label, id]) => ({
    db: 'hg19',
    url: `${HUMAN}/release_49/GRCh37_mapping/gencode.v49lift37.${file}.gff3.gz`,
    name: `GENCODE V49 - ${label}`,
    trackId: `hg19-gencode${id}`,
  })),
  ...[
    ['annotation', 'Comprehensive gene annotation', 'Comp'],
    ['basic.annotation', 'Basic gene annotation', 'Basic'],
    ['long_noncoding_RNAs', 'lncRNA gene annotation', 'LncRNA'],
    ['polyAs', 'PolyA feature annotation', 'PolyA'],
    [
      '2wayconspseudos',
      'Consensus pseudogenes predicted by the Yale and UCSC pipelines',
      'Pseudo',
    ],
    ['tRNAs', 'Predicted tRNA genes', 'tRNA'],
  ].map(([file, label, id]) => ({
    db: 'mm39',
    url: `${MOUSE}/release_M38/gencode.vM38.${file}.gff3.gz`,
    name: `GENCODE VM38 - ${label}`,
    trackId: `mm39-gencode${id}`,
  })),
]

/** The processed file downloadGencode.sh produces for a url. */
export function processedGencodeFile(url: string) {
  const base = path.basename(url).replace(/\.gff3\.gz$/, '')
  return path.join(GENCODE_PROCESSED_DIR, `${base}.sorted.gff3.gz`)
}

export const addGencodeTracks: FinalizeStep = {
  name: 'GENCODE tracks',
  run: ({ assemblyName, dir, config, compareOnly }) => {
    const counts: Record<string, number> = {}
    const asm = config.assemblies[0]?.name ?? assemblyName
    for (const track of GENCODE_TRACKS.filter(t => t.db === assemblyName)) {
      const processed = processedGencodeFile(track.url)
      const fileName = path.basename(processed)
      if (
        fs.existsSync(`${processed}.csi`) &&
        !config.tracks.some(t => t.trackId === track.trackId)
      ) {
        if (!compareOnly) {
          linkOrCopy(processed, path.join(dir, fileName))
          linkOrCopy(`${processed}.csi`, path.join(dir, `${fileName}.csi`))
        }
        config.tracks.push({
          type: 'FeatureTrack',
          trackId: track.trackId,
          name: track.name,
          adapter: {
            type: 'Gff3TabixAdapter',
            gffGzLocation: { uri: fileName, locationType: 'UriLocation' },
            index: {
              location: {
                uri: `${fileName}.csi`,
                locationType: 'UriLocation',
              },
              indexType: 'CSI',
            },
          },
          category: ['Genes and Gene Predictions'],
          assemblyNames: [asm],
        })
        counts.added = (counts.added ?? 0) + 1
      }
    }
    return counts
  },
}

// `node src/gencodeTracks.ts` lists "<db>\t<url>" for downloadGencode.sh.
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  for (const { db, url } of GENCODE_TRACKS) {
    console.log(`${db}\t${url}`)
  }
}
