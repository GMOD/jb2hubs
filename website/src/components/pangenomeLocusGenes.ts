// Gene models for genes GRCh38's primary assembly lacks, which CAT therefore
// never projects. GENCODE annotates them on GRCh38's alt contigs, so each
// locus maps those transcripts into every haplotype's window, where the window
// is the haplotype's walk across a GRCh38 span beside the insertion that holds
// the genes.

import { attribute } from './pangenomeGeneModels.ts'

import type { CatTranscript } from './pangenomeGeneModels.ts'

type Range = [number, number]

export interface GeneLocus {
  id: string
  window: { refName: string; start: number; end: number }
  // GENCODE transcript ids from the alt-aware annotation, by gene name; each
  // hit in a window is named by the candidate that aligns best there
  genes: Record<string, string[]>
  // CAT models a locus model replaces where they overlap it, by name
  replaces: RegExp
}

export const GENE_LOCI: GeneLocus[] = [
  {
    // 54 kb insertion at chr22:24,001,842 in 213 of 460 haplotypes
    id: 'gstt1',
    window: { refName: 'chr22', start: 24_001_000, end: 24_002_700 },
    genes: { GSTT1: ['ENST00000612885.4'] },
    replaces: /^GSTT/,
  },
  {
    // 6.7 kb insertion at chr19:54,297,005 in 359 of 460 haplotypes
    id: 'lilra3',
    window: { refName: 'chr19', start: 54_296_000, end: 54_298_000 },
    genes: { LILRA3: ['ENST00000620589.4'] },
    replaces: /^LILR/,
  },
  {
    // The DR haplotype's second expressed DRB gene, between DRB9 and DRB1:
    // DRB3 (DR52), DRB4 (DR53), DRB5 (DR51) or none (DR1, DR8). Candidates are
    // GENCODE's 13 coding DRB transcripts across GRCh38's eight MHC haplotypes.
    id: 'hla-drb',
    window: { refName: 'chr6', start: 32_474_000, end: 32_577_000 },
    genes: {
      'HLA-DRB1': [
        'ENST00000360004.6',
        'ENST00000399450.6',
        'ENST00000444645.6',
        'ENST00000437784.6',
        'ENST00000328980.11',
        'ENST00000419393.6',
      ],
      'HLA-DRB3': [
        'ENST00000426847.3',
        'ENST00000383126.8',
        'ENST00000307137.12',
      ],
      'HLA-DRB4': [
        'ENST00000411959.7',
        'ENST00000457451.7',
        'ENST00000411565.3',
      ],
      'HLA-DRB5': ['ENST00000374975.4'],
    },
    replaces: /^HLA-DRB/,
  },
]

export const MIN_IDENTITY = 0.95
export const MIN_COVERAGE = 0.9

export interface AltTranscript {
  id: string
  refName: string
  strand: string
  exons: Range[]
  cds: Range[]
}

// Reads the exons and CDS of the transcripts named in `ids` from GENCODE's
// alt-aware GFF3, a line at a time
export function altTranscriptReader(ids: Set<string>) {
  const transcripts = new Map<string, AltTranscript>()
  const add = (line: string) => {
    const f = line.split('\t')
    const type = f[2]
    if (type !== 'exon' && type !== 'CDS') {
      return
    }
    const id = attribute(f[8]!, 'transcript_id')
    if (!id || !ids.has(id)) {
      return
    }
    let t = transcripts.get(id)
    if (!t) {
      t = { id, refName: f[0]!, strand: f[6]!, exons: [], cds: [] }
      transcripts.set(id, t)
    }
    ;(type === 'exon' ? t.exons : t.cds).push([Number(f[3]) - 1, Number(f[4])])
  }
  return { add, transcripts }
}

const COMPLEMENT: Record<string, string> = {
  A: 'T',
  C: 'G',
  G: 'C',
  T: 'A',
  a: 't',
  c: 'g',
  g: 'c',
  t: 'a',
}

const reverseComplement = (bases: string) =>
  bases
    .split('')
    .reverse()
    .map(b => COMPLEMENT[b] ?? 'N')
    .join('')

// The transcript's bases 5' to 3' and its CDS in transcript coordinates, from
// `bases`, its contig from `offset`
export function spliced(t: AltTranscript, bases: string, offset: number) {
  const exons = [...t.exons].sort((a, b) => a[0] - b[0])
  const forward = exons
    .map(([s, e]) => bases.slice(s - offset, e - offset))
    .join('')
  const intoTranscript = (x: number) => {
    let n = 0
    for (const [s, e] of exons) {
      n += Math.max(0, Math.min(x, e) - s)
    }
    return n
  }
  const cds: Range = [
    intoTranscript(Math.min(...t.cds.map(c => c[0]))),
    intoTranscript(Math.max(...t.cds.map(c => c[1]))),
  ]
  return t.strand === '-'
    ? {
        bases: reverseComplement(forward),
        cds: [forward.length - cds[1], forward.length - cds[0]] as Range,
      }
    : { bases: forward, cds }
}

export interface WindowHit {
  gene: string
  identity: number
  coverage: number
  model: CatTranscript
}

// A minimap2 -c PAF line of a transcript spliced onto a window, whose target
// is named `<contig>:<start>-<end>`, as a model in contig coordinates: its
// exons from the cigar's introns, its coding span from the CDS's bases.
export function windowHit(paf: string, gene: string, cds: Range): WindowHit {
  const f = paf.split('\t')
  const [qname, qlen, qstart, qend, strand, target, , tstart] = f
  const cigar = f.find(c => c.startsWith('cg:Z:'))?.slice(5)
  if (!cigar) {
    throw new Error(`${qname} on ${target} has no cg:Z: cigar; run minimap2 -c`)
  }
  const colon = target!.lastIndexOf(':')
  const refName = target!.slice(0, colon)
  const offset = Number(target!.slice(colon + 1).split('-')[0])
  const length = Number(qlen)
  const coding: Range =
    strand === '+' ? cds : [length - cds[1], length - cds[0]]
  let t = offset + Number(tstart)
  let q = strand === '+' ? Number(qstart) : length - Number(qend)
  let exonStart = t
  const exons: Range[] = []
  let thick: Range | undefined
  for (const [, n, op] of cigar.matchAll(/(\d+)([MIDN=X])/g)) {
    const len = Number(n)
    if (op === 'M' || op === '=' || op === 'X') {
      const lo = Math.max(q, coding[0])
      const hi = Math.min(q + len, coding[1])
      if (lo < hi) {
        thick = [
          Math.min(thick?.[0] ?? Infinity, t + lo - q),
          Math.max(thick?.[1] ?? -Infinity, t + hi - q),
        ]
      }
      t += len
      q += len
    } else if (op === 'I') {
      q += len
    } else if (op === 'D') {
      t += len
    } else {
      exons.push([exonStart, t])
      t += len
      exonStart = t
    }
  }
  exons.push([exonStart, t])
  const identity = Number(f[9]) / Number(f[10])
  return {
    gene,
    identity,
    coverage: (Number(qend) - Number(qstart)) / length,
    model: {
      id: `${qname}@${refName}:${exons[0]![0]}`,
      name: gene,
      refName,
      start: exons[0]![0],
      end: t,
      strand: strand!,
      exons,
      cds: thick
        ? exons
            .map(([s, e]): Range => [
              Math.max(s, thick[0]),
              Math.min(e, thick[1]),
            ])
            .filter(([s, e]) => s < e)
        : [],
      source: qname!,
      goodness: identity * 100,
    },
  }
}

const score = (h: WindowHit) => h.identity * h.coverage

// Of hits that overlap, the best-aligned names the copy, kept when it aligns
// at MIN_IDENTITY over MIN_COVERAGE of the transcript
export function nameHits(hits: WindowHit[]) {
  const ranked = [...hits].sort((a, b) => score(b) - score(a))
  const named: WindowHit[] = []
  for (const h of ranked) {
    const m = h.model
    if (
      !named.some(
        n =>
          n.model.refName === m.refName &&
          n.model.start < m.end &&
          m.start < n.model.end,
      )
    ) {
      named.push(h)
    }
  }
  return named.filter(
    h => h.identity >= MIN_IDENTITY && h.coverage >= MIN_COVERAGE,
  )
}

export interface LocusModel extends CatTranscript {
  locus: string
}

// The locus models in place of the CAT models they replace
export function mergeLocusModels(
  models: CatTranscript[],
  locusModels: LocusModel[],
  loci = GENE_LOCI,
) {
  const replaces = new Map(loci.map(l => [l.id, l.replaces]))
  const replaced = (t: CatTranscript) =>
    locusModels.some(
      l =>
        !!replaces.get(l.locus)?.test(t.name) &&
        l.refName === t.refName &&
        l.start < t.end &&
        t.start < l.end,
    )
  return [...models.filter(t => !replaced(t)), ...locusModels]
}
