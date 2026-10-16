// The protein-coding genes of a window from the same RefSeq GFF the lanes' gene
// track reads, so the map and the lanes draw one span per gene. mygene.info's
// spans run past RefSeq's: its GSTM2 covers the whole GSTM1 window.

import { TabixIndexedFile } from '@gmod/tabix'
import { RemoteFile } from 'generic-filehandle2'

import { matchRefName } from './pangenomeRegion.ts'

import type { ParsedRegion, WindowGene } from './pangenomeRegion.ts'

const CODING_TRANSCRIPT = /^[NX]M_/

function attributes(column: string) {
  return new Map(
    column.split(';').flatMap(pair => {
      const i = pair.indexOf('=')
      return i > 0 ? [[pair.slice(0, i), pair.slice(i + 1)] as const] : []
    }),
  )
}

/**
 * One span per gene that has a coding transcript (an `NM_` or `XM_` id) among
 * the lines. The GFF's gene line is the union of the gene's transcripts, and a
 * line that overlaps the window brings its gene line with it.
 */
export function parseRefSeqGenes(lines: readonly string[]): WindowGene[] {
  const genes = new Map<string, WindowGene>()
  const coding = new Set<string>()
  for (const line of lines) {
    const columns = line.split('\t')
    const attrs = attributes(columns[8] ?? '')
    if (columns[2] === 'gene') {
      const id = attrs.get('ID')
      if (id) {
        genes.set(id, {
          symbol: id,
          start: Number(columns[3]) - 1,
          end: Number(columns[4]),
        })
      }
    } else if (CODING_TRANSCRIPT.test(attrs.get('ID') ?? '')) {
      const parent = attrs.get('Parent')
      if (parent) {
        coding.add(parent)
      }
    }
  }
  return [...genes.values()].filter(g => coding.has(g.symbol))
}

const files = new Map<string, TabixIndexedFile>()

function refSeqFile(url: string) {
  let file = files.get(url)
  if (!file) {
    file = new TabixIndexedFile({
      filehandle: new RemoteFile(url),
      csiFilehandle: new RemoteFile(`${url}.csi`),
    })
    files.set(url, file)
  }
  return file
}

export async function refSeqGenesInWindow(
  url: string,
  { chrom, start, end }: ParsedRegion,
  signal?: AbortSignal,
): Promise<WindowGene[]> {
  const file = refSeqFile(url)
  const name = matchRefName(
    chrom,
    await file.getReferenceSequenceNames({ signal }),
  )
  if (name === undefined) {
    throw new Error(`${chrom} is not a sequence in ${url}`)
  }
  const lines: string[] = []
  await file.getLines(name, start, end, {
    signal,
    lineCallback: line => {
      lines.push(line)
    },
  })
  return parseRefSeqGenes(lines).sort((a, b) => a.start - b.start)
}
