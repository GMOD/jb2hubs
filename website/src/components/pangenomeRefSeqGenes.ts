// The protein-coding genes of a window from the reference's own gene GFF, the
// one its gene track reads, so the map and the lanes draw one span per gene.
// UCSC's ncbiRefSeq.gff.gz names a gene by its ID; NCBI's own GFF prefixes IDs
// (`gene-AT5G10140`, `rna-NM_121052.3`) and carries the symbol as Name.

import { fileRefName, tabixFile } from './pangenomeTabix.ts'

import type { ParsedRegion, WindowGene } from './pangenomeRegion.ts'

const CODING_TRANSCRIPT = /^(rna-)?[NX]M_/

// GFF3 escapes a reserved character in a value as %XX: NCBI names
// Arabidopsis's CYCA2;3 `CYCA2%3B3`.
const unescape = (value: string) =>
  value.replaceAll(/%([0-9A-Fa-f]{2})/g, (_, hex: string) =>
    String.fromCharCode(Number.parseInt(hex, 16)),
  )

function attributes(column: string) {
  return new Map(
    column.split(';').flatMap(pair => {
      const i = pair.indexOf('=')
      return i > 0
        ? [[pair.slice(0, i), unescape(pair.slice(i + 1))] as const]
        : []
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
    const id = attrs.get('ID')
    if (columns[2] === 'gene' && id) {
      genes.set(id, {
        symbol: attrs.get('Name') ?? id,
        start: Number(columns[3]) - 1,
        end: Number(columns[4]),
      })
    } else if (CODING_TRANSCRIPT.test(id ?? '')) {
      const parent = attrs.get('Parent')
      if (parent) {
        coding.add(parent)
      }
    }
  }
  return [...genes].filter(([id]) => coding.has(id)).map(([, gene]) => gene)
}

// `refNames` are the window's sequence's names, its own first.
export async function refSeqGenesInWindow(
  url: string,
  { start, end }: ParsedRegion,
  refNames: readonly string[],
  signal?: AbortSignal,
): Promise<WindowGene[]> {
  const file = tabixFile(url, 'csi')
  const name = await fileRefName(file, refNames, url, signal)
  const lines: string[] = []
  await file.getLines(name, start, end, {
    signal,
    lineCallback: line => {
      lines.push(line)
    },
  })
  return parseRefSeqGenes(lines).sort((a, b) => a.start - b.start)
}
