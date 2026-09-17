// One gene model per gene, as BED12, from an HPRC CAT annotation.
//
// A haplotype lane draws one row of gene models, so what it needs from CAT is
// a transcript per gene, not CAT's ~5. The GFF3 also repeats a ~30-field
// attribute block on every exon and CDS row, so a whole-genome file is 3.3 GB
// uncompressed and 129 MB bgzipped where this is 3.4 MB for the same genes,
// measured on HG00097#1. BED12 carries a transcript's exons as blocks and its
// coding span as thickStart/thickEnd, which BedTabixAdapter turns back into
// exon, CDS and UTR subfeatures.

type Range = [number, number]

export interface CatTranscript {
  id: string
  name: string
  refName: string
  start: number
  end: number
  strand: string
  exons: Range[]
  cds: Range[]
}

// CAT's liftoff pass leaves a few "genes" spanning most of a contig (a 61 Mb
// lncRNA on HG01960#1); the longest real human gene is under 2.5 Mb.
export const MAX_GENE_SPAN = 5_000_000

function attribute(column: string, key: string) {
  const prefix = `${key}=`
  let from: number
  if (column.startsWith(prefix)) {
    from = prefix.length
  } else {
    const at = column.indexOf(`;${prefix}`)
    if (at === -1) {
      return undefined
    }
    from = at + 1 + prefix.length
  }
  const to = column.indexOf(';', from)
  return column.slice(from, to === -1 ? undefined : to)
}

const length = (ranges: Range[]) => ranges.reduce((n, [s, e]) => n + e - s, 0)

// Positive when `a` should stand for the gene over `b`: the longer coding
// sequence, then the longer spliced length, then the lower ID, so a rerun picks
// the same transcript.
function rank(a: CatTranscript, b: CatTranscript) {
  return (
    length(a.cds) - length(b.cds) ||
    length(a.exons) - length(b.exons) ||
    (a.id < b.id ? 1 : a.id > b.id ? -1 : 0)
  )
}

// Reads CAT's GFF3 a line at a time and hands `emit` one transcript per gene as
// each gene ends. It holds one gene, not the genome: all 3.3 million rows at
// once ran node out of heap. That relies on CAT's own order, a gene row, then
// its transcripts, then their exons and CDS, so a row whose transcript is not
// in the current gene throws rather than being dropped. A gene spanning more
// than MAX_GENE_SPAN is dropped.
export function catGeneModelReader(emit: (t: CatTranscript) => void) {
  let gene = new Map<string, CatTranscript>()
  const finish = () => {
    let best: CatTranscript | undefined
    for (const t of gene.values()) {
      if (t.end - t.start <= MAX_GENE_SPAN && (!best || rank(t, best) > 0)) {
        best = t
      }
    }
    if (best) {
      emit(best)
    }
    gene = new Map()
  }
  const add = (line: string) => {
    const f = line.split('\t')
    const type = f[2]
    if (line.startsWith('#') || f.length < 9) {
      return
    }
    const range: Range = [Number(f[3]) - 1, Number(f[4])]
    if (type === 'gene') {
      finish()
    } else if (type === 'transcript') {
      const id = attribute(f[8]!, 'ID')!
      gene.set(id, {
        id,
        name: attribute(f[8]!, 'gene_name') ?? attribute(f[8]!, 'Name') ?? id,
        refName: f[0]!,
        start: range[0],
        end: range[1],
        strand: f[6]!,
        exons: [],
        cds: [],
      })
    } else if (type === 'exon' || type === 'CDS') {
      const parent = attribute(f[8]!, 'Parent')!
      const t = gene.get(parent)
      if (!t) {
        throw new Error(
          `${type} of ${parent} is outside its gene; expected CAT's gene-ordered GFF3`,
        )
      }
      ;(type === 'exon' ? t.exons : t.cds).push(range)
    }
  }
  return { add, finish }
}

export function bed12(t: CatTranscript) {
  const exons = (
    t.exons.length ? [...t.exons] : [[t.start, t.end] as Range]
  ).sort((a, b) => a[0] - b[0])
  const [thickStart, thickEnd] = t.cds.length
    ? [Math.min(...t.cds.map(c => c[0])), Math.max(...t.cds.map(c => c[1]))]
    : [t.start, t.start]
  return [
    t.refName,
    t.start,
    t.end,
    t.name,
    0,
    t.strand,
    thickStart,
    thickEnd,
    0,
    exons.length,
    exons.map(([s, e]) => e - s).join(','),
    exons.map(([s]) => s - t.start).join(','),
  ].join('\t')
}
