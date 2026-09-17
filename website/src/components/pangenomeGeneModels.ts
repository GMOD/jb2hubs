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
  geneId: string
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

function attributes(column: string) {
  const out = new Map<string, string>()
  for (const pair of column.split(';')) {
    const at = pair.indexOf('=')
    if (at > 0) {
      out.set(pair.slice(0, at), pair.slice(at + 1))
    }
  }
  return out
}

// Collects the transcript, exon and CDS rows of one GFF3 file a line at a
// time, in any order, and ignores the rest.
export function catTranscriptReader() {
  const transcripts: Omit<CatTranscript, 'exons' | 'cds'>[] = []
  const parts = { exon: new Map<string, Range[]>(), CDS: new Map<string, Range[]>() }
  return {
    add(line: string) {
      const f = line.split('\t')
      const type = f[2]
      if (
        line.startsWith('#') ||
        f.length < 9 ||
        (type !== 'transcript' && type !== 'exon' && type !== 'CDS')
      ) {
        return
      }
      const a = attributes(f[8]!)
      const range: Range = [Number(f[3]) - 1, Number(f[4])]
      if (type === 'transcript') {
        const id = a.get('ID')!
        transcripts.push({
          id,
          geneId: a.get('gene_id') ?? a.get('Parent') ?? id,
          name: a.get('gene_name') ?? a.get('Name') ?? id,
          refName: f[0]!,
          start: range[0],
          end: range[1],
          strand: f[6]!,
        })
      } else {
        const byParent = parts[type]
        const parent = a.get('Parent')!
        const held = byParent.get(parent)
        if (held) {
          held.push(range)
        } else {
          byParent.set(parent, [range])
        }
      }
    },
    transcripts(): CatTranscript[] {
      return transcripts.map(t => ({
        ...t,
        exons: parts.exon.get(t.id) ?? [],
        cds: parts.CDS.get(t.id) ?? [],
      }))
    },
  }
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

// One transcript per gene. A gene spanning more than MAX_GENE_SPAN is dropped.
export function representativeTranscripts(transcripts: CatTranscript[]) {
  const best = new Map<string, CatTranscript>()
  for (const t of transcripts) {
    const held = best.get(t.geneId)
    if (t.end - t.start <= MAX_GENE_SPAN && (!held || rank(t, held) > 0)) {
      best.set(t.geneId, t)
    }
  }
  return [...best.values()]
}

export function bed12(t: CatTranscript) {
  const exons = (t.exons.length ? [...t.exons] : [[t.start, t.end] as Range])
    .sort((a, b) => a[0] - b[0])
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
