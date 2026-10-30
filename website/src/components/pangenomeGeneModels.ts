// One gene model per gene, as BED12, from an HPRC CAT annotation, or from
// JHU's Liftoff annotation of HG002, which CAT does not annotate.
//
// A haplotype lane draws one row of gene models, so what it needs from CAT is
// a transcript per gene, not CAT's ~5. The GFF3 also repeats a ~30-field
// attribute block on every exon and CDS row, so a whole-genome file is 3.3 GB
// uncompressed and 129 MB bgzipped where this is 3.4 MB for the same genes,
// measured on HG00097#1. BED12 carries a transcript's exons as blocks and its
// coding span as thickStart/thickEnd, which BedTabixAdapter turns back into
// exon, CDS and UTR subfeatures.
//
// CAT projects GENCODE v48 (every `source_transcript` in HG00097#1's annotation
// is a v48 id at its v48 version) and carries no canonical tag of its own, so
// the rules read v48's GFF3 for which transcript Ensembl calls canonical and
// where each transcript lies on GRCh38.

type Range = [number, number]

export interface GeneModel {
  id: string
  name: string
  refName: string
  start: number
  end: number
  strand: string
  exons: Range[]
  cds: Range[]
}

export interface CatTranscript extends GeneModel {
  // the GENCODE transcript CAT projected, versioned as in GENCODE
  source: string
  // CAT's alignment goodness of the projection, in percent
  goodness: number
}

interface ReferenceTranscript {
  refName: string
  start: number
  end: number
  canonical: boolean
}

export type Reference = Map<string, ReferenceTranscript>

export interface Placement {
  refName: string
  start: number
  end: number
}

// For each source transcript, keyed by id, the stretches of this haplotype's
// walk across its GRCh38 span in the pangenome graph. An empty list means the
// walk does not cross the span; a missing key means no walk data.
export type Placements = Map<string, Placement[]>

// CAT's liftoff pass leaves a few "genes" spanning most of a contig (a 61 Mb
// lncRNA on HG01960#1); the longest real human gene is under 2.5 Mb.
export const MAX_GENE_SPAN = 5_000_000

export function attribute(column: string, key: string) {
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

// Reads GENCODE's GFF3 a line at a time into its transcripts, keyed by id.
export function referenceReader() {
  const transcripts: Reference = new Map()
  const add = (line: string) => {
    const f = line.split('\t')
    if (f[2] !== 'transcript') {
      return
    }
    transcripts.set(attribute(f[8]!, 'transcript_id')!, {
      refName: f[0]!,
      start: Number(f[3]) - 1,
      end: Number(f[4]),
      canonical: !!attribute(f[8]!, 'tag')
        ?.split(',')
        .includes('Ensembl_canonical'),
    })
  }
  return { add, transcripts }
}

const length = (ranges: Range[]) => ranges.reduce((n, [s, e]) => n + e - s, 0)

function sharedBases(a: Range[], b: Range[]) {
  let n = 0
  for (const [s1, e1] of a) {
    for (const [s2, e2] of b) {
      n += Math.max(0, Math.min(e1, e2) - Math.max(s1, s2))
    }
  }
  return n
}

const byId = (a: GeneModel, b: GeneModel) =>
  a.id < b.id ? 1 : a.id > b.id ? -1 : 0

// Positive when `a` has the longer coding sequence, then the longer spliced
// length, then the lower ID, so a rerun picks the same transcript
const longer = (a: GeneModel, b: GeneModel) =>
  length(a.cds) - length(b.cds) ||
  length(a.exons) - length(b.exons) ||
  byId(a, b)

function best<T extends GeneModel>(
  transcripts: Iterable<T>,
  rank: (a: T, b: T) => number,
) {
  let top: T | undefined
  for (const t of transcripts) {
    if (!top || rank(t, top) > 0) {
      top = t
    }
  }
  return top
}

// The genes a lane draws, and what was dropped: a gene with no symbol, and a
// gene whose own row spans more than MAX_GENE_SPAN, even where its transcripts
// are shorter
function geneTally<T extends GeneModel>() {
  const kept: T[] = []
  let unnamed = 0
  let tooLong = 0
  const add = (model: T | undefined, named: boolean, span: number) => {
    if (model && !named) {
      unnamed++
    } else if (model && span > MAX_GENE_SPAN) {
      tooLong++
    } else if (model) {
      kept.push(model)
    }
  }
  return {
    add,
    kept,
    counts: () => ({ unnamed, tooLong }),
  }
}

// Positive when `a` should stand for the gene over `b`: Ensembl's canonical
// transcript; among projections of it, the one whose span is nearest its
// GRCh38 span, since liftoff stretches some (GSTM2-204, 23 kb where GSTM2 is
// 7 kb); then `longer`.
function rank(a: CatTranscript, b: CatTranscript, reference: Reference) {
  const ra = reference.get(a.source)
  const rb = reference.get(b.source)
  const canonical = Number(!!ra?.canonical) - Number(!!rb?.canonical)
  const stretch = (t: CatTranscript, r: ReferenceTranscript) =>
    Math.abs(t.end - t.start - (r.end - r.start))
  return (
    canonical ||
    (ra?.canonical && rb?.canonical ? stretch(b, rb) - stretch(a, ra) : 0) ||
    longer(a, b)
  )
}

// Two genes whose coding exons coincide here, though their source transcripts
// lie apart on GRCh38, are one locus CAT projected two paralogs onto: GSTM1
// onto GSTM2 in HG00097#1, which lacks GSTM1. Readthroughs and genes that
// share exons in GRCh38 too are left alone.
function stacked(a: CatTranscript, b: CatTranscript, reference: Reference) {
  const ra = reference.get(a.source)
  const rb = reference.get(b.source)
  const apartOnGrch38 =
    !!ra &&
    !!rb &&
    (ra.refName !== rb.refName || ra.end <= rb.start || rb.end <= ra.start)
  const shared = sharedBases(a.cds, b.cds)
  return (
    apartOnGrch38 && shared > length(a.cds) / 2 && shared > length(b.cds) / 2
  )
}

// True when the walk's stretches across the model's source span and the model
// overlap each other by more than half each, so a walk that runs on through a
// deletion's flanks does not place the gene; undefined without walk data.
function placedHere(t: CatTranscript, placements: Placements | undefined) {
  const spans = placements?.get(t.source)
  if (!spans) {
    return undefined
  }
  const here = spans.filter(
    p => p.refName === t.refName && p.start < t.end && t.start < p.end,
  )
  const shared = here.reduce(
    (n, p) => n + Math.min(p.end, t.end) - Math.max(p.start, t.start),
    0,
  )
  const projected = here.reduce((n, p) => n + p.end - p.start, 0)
  return shared > (t.end - t.start) / 2 && shared > projected / 2
}

// Of two stacked genes, the one the graph places here keeps the locus, and
// failing that the better-aligned one. Goodness alone keeps DRB5 on a
// haplotype's DRB1, where CAT scores DRB5 at its default of 100 and DRB1 at
// 92%, and the same scores must keep GSTM2 over GSTM1 at 93.4% where the
// haplotype lacks GSTM1.
function better(
  a: CatTranscript,
  b: CatTranscript,
  placements: Placements | undefined,
) {
  const pa = placedHere(a, placements)
  const pb = placedHere(b, placements)
  return (
    (pa === undefined || pb === undefined ? 0 : Number(pa) - Number(pb)) ||
    a.goodness - b.goodness ||
    length(a.cds) - length(b.cds) ||
    byId(a, b)
  )
}

function stackedPairs(models: CatTranscript[], reference: Reference) {
  const coding = models
    .filter(t => t.cds.length)
    .sort((a, b) =>
      a.refName < b.refName
        ? -1
        : a.refName > b.refName
          ? 1
          : a.start - b.start,
    )
  const pairs: [CatTranscript, CatTranscript][] = []
  for (const [i, a] of coding.entries()) {
    for (
      let j = i + 1;
      j < coding.length &&
      coding[j]!.refName === a.refName &&
      coding[j]!.start < a.end;
      j++
    ) {
      const b = coding[j]!
      if (a.strand === b.strand && stacked(a, b, reference)) {
        pairs.push([a, b])
      }
    }
  }
  return pairs
}

function unstack(
  models: CatTranscript[],
  reference: Reference,
  placements: Placements | undefined,
) {
  const dropped = new Set<CatTranscript>()
  for (const [a, b] of stackedPairs(models, reference)) {
    if (!dropped.has(a) && !dropped.has(b)) {
      dropped.add(better(a, b, placements) > 0 ? b : a)
    }
  }
  return models.filter(t => !dropped.has(t))
}

// CAT writes its alignment goodness to the score column in hundredths of a
// percent (9,000 to 10,000), and its default, 100 or 1,000, where it did not
// align the projection itself, as for most liftoff placements. A default reads
// as a full match, since liftoff placed that gene there by its own alignment.
const goodness = (score: number) => (score > 1000 ? score / 100 : 100)

interface GeneModels {
  models: CatTranscript[]
  unnamed: number
  tooLong: number
  stacked: number
}

// Reads CAT's GFF3 a line at a time and returns one transcript per gene. It
// holds one gene's rows and one model per gene finished, not the genome: all
// 3.3 million rows at once ran node out of heap. That relies on CAT's own
// order, a gene row, then its transcripts, then their exons and CDS, so a row
// whose transcript is not in the current gene throws rather than being dropped.
export function catGeneModelReader(reference: Reference) {
  const tally = geneTally<CatTranscript>()
  const kept = tally.kept
  let gene = new Map<string, CatTranscript>()
  let geneSpan = 0
  let geneName: string | undefined
  const finishGene = () => {
    tally.add(
      best(gene.values(), (a, b) => rank(a, b, reference)),
      !!geneName,
      geneSpan,
    )
    gene = new Map()
    geneSpan = 0
  }
  const add = (line: string) => {
    const f = line.split('\t')
    const type = f[2]
    if (line.startsWith('#') || f.length < 9) {
      return
    }
    const range: Range = [Number(f[3]) - 1, Number(f[4])]
    if (type === 'gene') {
      finishGene()
      geneSpan = range[1] - range[0]
      // A gene GENCODE gives no symbol, or CAT's own novel gene, would be
      // labelled by an id a reader cannot look up: 38,000 of HG00097#1's
      // 82,851 genes, mostly lncRNA, crowding a lane's one row. CAT names a
      // novel gene by its own id, `<sample>_ha_G<number>`, in `gene_name`.
      geneName = attribute(f[8]!, 'gene_name')
      if (geneName && /^(ENSG\d|\w+_ha_G\d+$)/.test(geneName)) {
        geneName = undefined
      }
    } else if (type === 'transcript') {
      const id = attribute(f[8]!, 'ID')!
      gene.set(id, {
        id,
        name: geneName ?? id,
        refName: f[0]!,
        start: range[0],
        end: range[1],
        strand: f[6]!,
        exons: [],
        cds: [],
        source: attribute(f[8]!, 'source_transcript') ?? '',
        goodness: goodness(Number(f[5])),
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
  // The source transcripts of the stacked genes, for the caller to place in
  // the graph before `finish`
  const stackedSources = () => {
    finishGene()
    return [
      ...new Set(
        stackedPairs(kept, reference).flatMap(p => p.map(t => t.source)),
      ),
    ]
  }
  const finish = (placements?: Placements): GeneModels => {
    finishGene()
    const models = unstack(kept, reference, placements)
    return {
      models,
      ...tally.counts(),
      stacked: kept.length - models.length,
    }
  }
  return { add, stackedSources, finish }
}

// RefSeq's placeholder symbols, `LOC` and a gene id, and the transcript
// assembly ids that RefSeq writes as a symbol where it has none
const REFSEQ_UNNAMED = /^(LOC\d+|XLOC_\d+|TCONS_\d+)$/

interface LiftoffGene {
  name: string | undefined
  biotype: string | undefined
  model: GeneModel
}

interface LiftoffTranscript extends GeneModel {
  gene: string
  mane: boolean
}

// Positive when `a` should stand for the gene over `b`: RefSeq's MANE Select
// transcript, then `longer`
const liftoffRank = (a: LiftoffTranscript, b: LiftoffTranscript) =>
  Number(a.mane) - Number(b.mane) || longer(a, b)

// Reads JHU's Liftoff GFF3 of HG002 (RefSeq lifted from T2T-CHM13) and returns
// one transcript per gene. The file is in transcript order, so a gene's
// transcripts can follow the next gene's row; the reader holds every
// transcript's exons and CDS until `finish`, about 3.6 million ranges.
//
// Liftoff writes a contig as `chr1_PATERNAL`, the assembly as `chr1`. A gene
// row without transcripts, mostly pseudogenes and 12,724 of HG002 haplotype 1's
// kept genes, draws as one non-coding block over the gene, as CAT's projections
// of GENCODE's pseudogene transcripts do. RefSeq's `other` genes are clusters
// spanning their member genes (PCDHA@, UGT1A, TRB, IGL) and are dropped.
//
// A transcript that runs past its gene row stands for no gene: KLRC2's
// `hg002_chr12_paternal_349.2` spans both tandem copies on haplotype 1.
export function liftoffGeneModelReader() {
  const genes = new Map<string, LiftoffGene>()
  const transcripts = new Map<string, LiftoffTranscript>()
  const add = (line: string) => {
    const f = line.split('\t')
    const type = f[2]
    if (line.startsWith('#') || f.length < 9) {
      return
    }
    const refName = f[0]!.replace(/_(PATERNAL|MATERNAL)$/, '')
    const start = Number(f[3]) - 1
    const end = Number(f[4])
    const id = attribute(f[8]!, 'ID')
    if (type === 'gene') {
      genes.set(id!, {
        name: attribute(f[8]!, 'gene_name'),
        biotype: attribute(f[8]!, 'gene_biotype'),
        model: {
          id: id!,
          name: '',
          refName,
          start,
          end,
          strand: f[6]!,
          exons: [[start, end]],
          cds: [],
        },
      })
    } else if (type === 'transcript') {
      transcripts.set(id!, {
        id: id!,
        name: '',
        refName,
        start,
        end,
        strand: f[6]!,
        exons: [],
        cds: [],
        gene: attribute(f[8]!, 'Parent')!,
        mane: !!attribute(f[8]!, 'tag')?.split(',').includes('MANE Select'),
      })
    } else if (type === 'exon' || type === 'CDS') {
      const parent = attribute(f[8]!, 'Parent')!
      const t = transcripts.get(parent)
      if (!t) {
        throw new Error(`${type} of ${parent} precedes its transcript`)
      }
      ;(type === 'exon' ? t.exons : t.cds).push([start, end])
    }
  }
  const finish = () => {
    const byGene = new Map<string, LiftoffTranscript[]>()
    for (const t of transcripts.values()) {
      byGene.set(t.gene, [...(byGene.get(t.gene) ?? []), t])
    }
    const tally = geneTally<GeneModel>()
    let clusters = 0
    for (const [id, gene] of genes) {
      const name = gene.name ?? ''
      if (gene.biotype === 'other') {
        clusters++
        continue
      }
      const top = best(
        (byGene.get(id) ?? []).filter(
          t => t.start >= gene.model.start && t.end <= gene.model.end,
        ),
        liftoffRank,
      )
      const model: GeneModel = top
        ? {
            id: top.id,
            name,
            refName: top.refName,
            start: top.start,
            end: top.end,
            strand: top.strand,
            exons: top.exons,
            cds: top.cds,
          }
        : { ...gene.model, name }
      tally.add(
        model,
        !!name && !REFSEQ_UNNAMED.test(name),
        gene.model.end - gene.model.start,
      )
    }
    return { models: tally.kept, ...tally.counts(), clusters }
  }
  return { add, finish }
}

export function bed12(t: GeneModel) {
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
