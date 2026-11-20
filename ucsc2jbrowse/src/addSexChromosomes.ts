import type { TransmissionEntry } from './types.ts'
import type { FinalizeStep } from './utils/finalizeStep.ts'

const X: TransmissionEntry = { refName: 'chrX', sex: 'male', from: 'mother' }
const Y: TransmissionEntry = { refName: 'chrY', sex: 'male', from: 'father' }
const Z: TransmissionEntry = { refName: 'chrZ', sex: 'female', from: 'father' }
const W: TransmissionEntry = { refName: 'chrW', sex: 'female', from: 'mother' }

function each(dbs: string[], entries: TransmissionEntry[]) {
  return Object.fromEntries(dbs.map(db => [db, entries]))
}

// Named db by db, never read off a contig name: sacCer3's and gasAcu1's chrX
// are chromosome 10, platypus has five X's, and a Drosophila attached-X stock
// gives sons their father's X. Each list names only the sex chromosomes the
// assembly has; a db left out gets no entry, which the Mendelian check reads
// leniently.
export const SEX_CHROMOSOMES: Record<string, TransmissionEntry[]> = {
  ...each(
    [
      'bosTau7',
      'calJac3',
      'calJac4',
      'chlSab2',
      'hg16',
      'hg17',
      'hg18',
      'hg19',
      'hg38',
      'hs1',
      'mm7',
      'mm8',
      'mm9',
      'mm10',
      'mm39',
      'panTro1',
      'panTro2',
      'panTro3',
      'panTro4',
      'panTro5',
      'panTro6',
      'rheMac8',
      'rheMac10',
      'rn6',
      'rn7',
      'susScr3',
      'susScr11',
    ],
    [X, Y],
  ),
  ...each(
    [
      'bosTau2',
      'bosTau3',
      'bosTau4',
      'bosTau6',
      'bosTau8',
      'bosTau9',
      'canFam1',
      'canFam2',
      'canFam3',
      'canFam4',
      'canFam5',
      'canFam6',
      'equCab1',
      'equCab2',
      'equCab3',
      'felCat4',
      'felCat5',
      'felCat8',
      'felCat9',
      'gorGor3',
      'gorGor4',
      'gorGor6',
      'macFas5',
      'monDom4',
      'monDom5',
      'nasLar1',
      'nomLeu3',
      'oryCun2',
      'oviAri1',
      'oviAri3',
      'oviAri4',
      'panPan2',
      'panPan3',
      'papAnu2',
      'papAnu4',
      'ponAbe2',
      'ponAbe3',
      'rheMac2',
      'rheMac3',
      'rn3',
      'rn4',
      'rn5',
      'susScr2',
    ],
    [X],
  ),
  ...each(
    [
      'galGal2',
      'galGal3',
      'galGal4',
      'galGal5',
      'galGal6',
      'melGal1',
      'melGal5',
    ],
    [Z, W],
  ),
  ...each(['taeGut1', 'taeGut2'], [Z]),
}

export const addSexChromosomes: FinalizeStep = {
  name: 'sex chromosomes',
  run: ({ config, assemblyName }) => {
    const assembly = config.assemblies[0]
    const entries = SEX_CHROMOSOMES[assemblyName]
    const counts: Record<string, number> = {}
    if (assembly !== undefined && entries !== undefined) {
      assembly.transmission = [...entries, ...(assembly.transmission ?? [])]
      counts.assemblies = 1
    }
    return counts
  },
}
