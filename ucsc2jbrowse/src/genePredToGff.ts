import fs from 'fs'
import { fileURLToPath } from 'url'

import { encodeGffAttribute } from './utils/encodeGffAttribute.ts'
import { getColNames } from './utils/getColNames.ts'
import { gzLines, tableRows } from './utils/gzLines.ts'
import { parseTableLine } from './utils/parseTableLine.ts'

export interface GenePred {
  name: string
  gene: string
  chrom: string
  strand: string
  txStart: number
  txEnd: number
  cdsStart: number
  cdsEnd: number
  exons: [number, number][]
  frames?: number[]
}

export interface NcbiTranscript {
  type: string
  attributes: string
  translExcept?: string
}

// The ncbiRefSeqLink column that holds a comma list (`A2MD,CPAMD5`). The others
// are prose: hg38's `product` has a comma in 163,098 rows.
const LIST_COLUMNS = new Set(['gene_synonym'])

const TYPE_OF_GBKEY: Record<string, string> = {
  mRNA: 'mRNA',
  ncRNA: 'ncRNA',
  rRNA: 'rRNA',
  tRNA: 'tRNA',
  precursor_RNA: 'primary_transcript',
  misc_RNA: 'transcript',
}

function numbers(list: string | undefined) {
  return (list ?? '').split(',').filter(Boolean).map(Number)
}

// Undefined for a row whose exons run backwards or outside the transcript: 9 of
// galGal2's xenoRefGene rows end an exon before it starts.
export function parseGenePred(
  row: Record<string, string | undefined>,
): GenePred | undefined {
  const name = row.name || row.name2 || ''
  let txStart = Number(row.txStart)
  let txEnd = Number(row.txEnd)
  if (txStart > txEnd) {
    ;[txStart, txEnd] = [txEnd, txStart]
  }
  const starts = numbers(row.exonStarts)
  const ends = numbers(row.exonEnds)
  const exons = starts.map((s, i) => [s, ends[i]!] as [number, number])
  if (
    !name ||
    !row.chrom ||
    starts.length === 0 ||
    starts.length !== ends.length ||
    exons.some(([s, e]) => !(s >= txStart && e > s))
  ) {
    return undefined
  }
  const frames =
    row.exonFrames === undefined ? undefined : numbers(row.exonFrames)
  return {
    name,
    gene: row.name && row.name2 ? row.name2 : `${name}-gene`,
    chrom: row.chrom,
    strand: row.strand === '-' ? '-' : '+',
    txStart,
    txEnd,
    cdsStart: Number(row.cdsStart),
    cdsEnd: Number(row.cdsEnd),
    exons,
    frames: frames?.length === exons.length ? frames : undefined,
  }
}

// Exact placement, so an enrichment never lands on a transcript NCBI drew
// differently: on danRer11, 18 accession.versions differ in structure.
export function structureKey(
  name: string,
  txStart: number,
  txEnd: number,
  exons: [number, number][],
) {
  return [name, txStart, txEnd, ...exons.flat()].join(',')
}

// The CDS within each exon, in genomic order, with its GFF3 phase. The table's
// exonFrames are authoritative where present: UCSC takes them from NCBI, so
// they hold the frameshifts that counting bases from cdsStart gets wrong.
export function codingSegments(t: GenePred) {
  if (t.cdsStart >= t.cdsEnd) {
    return []
  }
  const segments = t.exons
    .map(([s, e], i) => ({
      start: Math.max(s, t.cdsStart),
      end: Math.min(e, t.cdsEnd),
      frame: t.frames?.[i] ?? -1,
    }))
    .filter(s => s.start < s.end)
  if (!segments.every(s => s.frame >= 0 && s.frame <= 2)) {
    let bases = 0
    for (const s of t.strand === '-' ? segments.toReversed() : segments) {
      s.frame = bases % 3
      bases += s.end - s.start
    }
  }
  return segments.map(({ start, end, frame }) => ({
    start,
    end,
    phase: (3 - frame) % 3,
  }))
}

function rawAttributes(column: string) {
  return new Map(
    column.split(';').flatMap(pair => {
      const i = pair.indexOf('=')
      return i > 0 ? [[pair.slice(0, i), pair.slice(i + 1)] as const] : []
    }),
  )
}

// What NCBI's GFF3 says about each transcript beyond UCSC's table, keyed by
// structureKey. Values are copied still encoded: the file holds `%2C` inside
// transl_except and `%25` in prose, and decoding them would need re-encoding.
export async function readNcbiTranscripts(
  lines: Iterable<string> | AsyncIterable<string>,
) {
  const transcripts = new Map<
    string,
    {
      name: string
      type: string
      start: number
      end: number
      attributes: string
    }
  >()
  const exons = new Map<string, [number, number][]>()
  const translExcept = new Map<string, string>()
  for await (const line of lines) {
    if (!line || line.startsWith('#')) {
      continue
    }
    const [, , type, start, end, , , , column = ''] = line.split('\t')
    const attrs = rawAttributes(column)
    const parent = attrs.get('Parent')
    if (type === 'exon' && parent) {
      const list = exons.get(parent) ?? []
      list.push([Number(start) - 1, Number(end)])
      exons.set(parent, list)
    } else if (type === 'CDS' && parent) {
      const except = attrs.get('transl_except')
      if (except) {
        translExcept.set(parent, except)
      }
    } else {
      const id = attrs.get('ID')
      const name = attrs.get('transcript_id')
      if (id && name && type) {
        transcripts.set(id, {
          name,
          type,
          start: Number(start) - 1,
          end: Number(end),
          attributes: ['tag', 'exception']
            .flatMap(k => {
              const v = attrs.get(k)
              return v ? [`${k}=${v}`] : []
            })
            .join(';'),
        })
      }
    }
  }
  const byStructure = new Map<string, NcbiTranscript>()
  for (const [id, t] of transcripts) {
    const blocks = exons.get(id)
    if (blocks) {
      blocks.sort((a, b) => a[0] - b[0])
      byStructure.set(structureKey(t.name, t.start, t.end, blocks), {
        type: t.type,
        attributes: t.attributes,
        translExcept: translExcept.get(id),
      })
    }
  }
  return byStructure
}

// The Link table's columns as GFF3 attributes, keyed by transcript. `id`
// repeats the transcript's ID, and `name` is the gene: JBrowse reads attribute
// keys case-insensitively, so a `name` would relabel every transcript.
export async function readLinkTable(
  colNames: string[],
  rows: Iterable<string> | AsyncIterable<string>,
) {
  const link = new Map<string, { gbkey?: string; attributes: string }>()
  for await (const line of rows) {
    const row = parseTableLine(line, colNames)
    const attributes = Object.entries(row)
      .filter(([key, val]) => key !== 'id' && val)
      .map(([key, val]) => {
        const values = LIST_COLUMNS.has(key) ? val.split(',') : [val]
        return `${key === 'name' ? 'gene_name' : key}=${values
          .filter(Boolean)
          .map(encodeGffAttribute)
          .join(',')}`
      })
      .join(';')
    link.set(row.id ?? '', { gbkey: row.gbkey, attributes })
  }
  return link
}

function row(
  t: GenePred,
  source: string,
  type: string,
  start: number,
  end: number,
  phase: string,
  attributes: string,
) {
  return [
    t.chrom,
    source,
    type,
    start + 1,
    end,
    '.',
    t.strand,
    phase,
    attributes,
  ].join('\t')
}

export function transcriptRows(
  t: GenePred,
  {
    source,
    geneId,
    link,
    ncbi,
  }: {
    source: string
    geneId: string
    link?: { gbkey?: string; attributes: string }
    ncbi?: NcbiTranscript
  },
) {
  const id = encodeGffAttribute(t.name)
  const cds = codingSegments(t)
  const type =
    ncbi?.type ??
    TYPE_OF_GBKEY[link?.gbkey ?? ''] ??
    (cds.length > 0 ? 'mRNA' : 'transcript')
  const attributes = [
    `ID=${id}`,
    `Parent=${encodeGffAttribute(geneId)}`,
    `Name=${id}`,
    `gene_id=${encodeGffAttribute(t.gene)}`,
    `transcript_id=${id}`,
    link?.attributes,
    ncbi?.attributes,
  ]
    .filter(Boolean)
    .join(';')
  const cdsAttributes = ncbi?.translExcept
    ? `Parent=${id};transl_except=${ncbi.translExcept}`
    : `Parent=${id}`
  return [
    row(t, source, type, t.txStart, t.txEnd, '.', attributes),
    ...t.exons.map(([s, e]) =>
      row(t, source, 'exon', s, e, '.', `Parent=${id}`),
    ),
    ...cds.map(c =>
      row(t, source, 'CDS', c.start, c.end, String(c.phase), cdsAttributes),
    ),
  ]
}

interface GeneSpan {
  gene: string
  chrom: string
  strand: string
  start: number
  end: number
}

// One gene row per gene and chromosome, spanning every placement there. A gene
// named like one of its transcripts (exoniphy names each gene after its only
// transcript) takes a `gene:` prefix, or the transcript would be its own parent.
export function geneRows(
  spans: Iterable<GeneSpan>,
  geneId: (gene: string) => string,
  source: string,
) {
  return [...spans].map(g =>
    [
      g.chrom,
      source,
      'gene',
      g.start + 1,
      g.end,
      '.',
      g.strand,
      '.',
      `ID=${encodeGffAttribute(geneId(g.gene))};Name=${encodeGffAttribute(g.gene)};gene_id=${encodeGffAttribute(g.gene)}`,
    ].join('\t'),
  )
}

async function* genePreds(sqlFile: string, txtGzFile: string) {
  const { colNames } = getColNames(fs.readFileSync(sqlFile, 'utf8'))
  for await (const line of tableRows(txtGzFile)) {
    yield parseGenePred(parseTableLine(line, colNames))
  }
}

class Output {
  private chunks: string[] = []
  private size = 0

  async write(line: string) {
    this.chunks.push(line, '\n')
    this.size += line.length + 1
    if (this.size > 1 << 20) {
      await this.flush()
    }
  }

  async flush() {
    const text = this.chunks.join('')
    this.chunks = []
    this.size = 0
    if (!process.stdout.write(text)) {
      await new Promise(resolve => process.stdout.once('drain', resolve))
    }
  }
}

async function main(args: string[]) {
  const usage =
    'Usage: node genePredToGff.ts <table.sql> <table.txt.gz> [--link <link.sql> <link.txt.gz>] [--ncbi-gff <genomic.gff.gz>]'
  const [sqlFile, txtGzFile, ...rest] = args
  const linkAt = rest.indexOf('--link')
  const gffAt = rest.indexOf('--ncbi-gff')
  const linkSql = linkAt >= 0 ? rest[linkAt + 1] : undefined
  const linkTxt = linkAt >= 0 ? rest[linkAt + 2] : undefined
  const gffFile = gffAt >= 0 ? rest[gffAt + 1] : undefined
  if (
    !sqlFile ||
    !txtGzFile ||
    (linkAt >= 0 && !linkTxt) ||
    (gffAt >= 0 && !gffFile)
  ) {
    console.error(usage)
    process.exit(1)
  }
  const source = getColNames(fs.readFileSync(sqlFile, 'utf8')).tableName

  const names = new Set<string>()
  const spans = new Map<string, GeneSpan>()
  let skipped = 0
  for await (const t of genePreds(sqlFile, txtGzFile)) {
    if (!t) {
      skipped += 1
      continue
    }
    names.add(t.name)
    const key = `${t.gene}\t${t.chrom}`
    const span = spans.get(key)
    if (span) {
      span.start = Math.min(span.start, t.txStart)
      span.end = Math.max(span.end, t.txEnd)
    } else {
      spans.set(key, {
        gene: t.gene,
        chrom: t.chrom,
        strand: t.strand,
        start: t.txStart,
        end: t.txEnd,
      })
    }
  }
  const geneId = (gene: string) => (names.has(gene) ? `gene:${gene}` : gene)

  const link =
    linkSql && linkTxt
      ? await readLinkTable(
          getColNames(fs.readFileSync(linkSql, 'utf8')).colNames,
          tableRows(linkTxt),
        )
      : undefined
  const ncbi = gffFile ? await readNcbiTranscripts(gzLines(gffFile)) : undefined

  const out = new Output()
  await out.write('##gff-version 3')
  for (const line of geneRows(spans.values(), geneId, source)) {
    await out.write(line)
  }
  let written = 0
  let enriched = 0
  for await (const t of genePreds(sqlFile, txtGzFile)) {
    if (!t) {
      continue
    }
    const match = ncbi?.get(structureKey(t.name, t.txStart, t.txEnd, t.exons))
    written += 1
    enriched += match ? 1 : 0
    for (const line of transcriptRows(t, {
      source,
      geneId: geneId(t.gene),
      link: link?.get(t.name),
      ncbi: match,
    })) {
      await out.write(line)
    }
  }
  await out.flush()

  if (skipped > 0) {
    console.error(
      `${txtGzFile}: skipped ${skipped} rows with inverted or out-of-range exons`,
    )
  }
  if (ncbi) {
    console.error(
      `${txtGzFile}: ${enriched} of ${written} transcripts matched ${gffFile} exactly`,
    )
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  await main(process.argv.slice(2))
}
