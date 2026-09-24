// Reading the published structural-state sidecar, in node or in a browser.
//
// It is one tabix-indexed file for the genome (18 MB), so a window is a ranged
// read of a few KB: 300 ms for a typical one and a third of a second for MHC
// class II, the densest window in the corpus, measured over https on
// 2026-09-17. Nothing here is per locus: the loci table's launches and a region
// a reader types go through the same query.

import { TabixIndexedFile } from '@gmod/tabix'
import { RemoteFile } from 'generic-filehandle2'

import { matchRefName } from './pangenomeRegion.ts'
import { parseSvStateRow } from './pangenomeSvStates.ts'

import type { SvStateRow } from './pangenomeSvStates.ts'

export interface SvStatesQuery {
  // the file's own name for the chromosome asked for
  chrom: string
  haplotypes: string[]
  rows: SvStateRow[]
}

// The header names the haplotypes in the order every row's genotypes are
// packed, so a reader never needs a second file to know whose lane is whose.
function haplotypesOf(header: string) {
  const line = header.split('\n').find(l => l.startsWith('#haplotypes\t'))
  if (!line) {
    throw new Error('the sv-states file has no #haplotypes header')
  }
  return line.slice('#haplotypes\t'.length).split(',')
}

export function openSvStates(url: string) {
  const file = new TabixIndexedFile({
    filehandle: new RemoteFile(url),
    tbiFilehandle: new RemoteFile(`${url}.tbi`),
  })
  return async function query(
    refName: string,
    start: number,
    end: number,
  ): Promise<SvStatesQuery> {
    const chrom = matchRefName(refName, await file.getReferenceSequenceNames())
    if (chrom === undefined) {
      throw new Error(`${refName} is not a sequence in the callset`)
    }
    const rows: SvStateRow[] = []
    const [header] = await Promise.all([
      file.getHeader(),
      file.getLines(chrom, start, end, line => {
        rows.push(parseSvStateRow(line))
      }),
    ])
    return { chrom, haplotypes: haplotypesOf(header), rows }
  }
}
