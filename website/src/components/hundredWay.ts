// The hosted 100-vertebrate protein alignment: a second alignment source for
// human genes, beside the live NCBI/PANTHER + EBI Clustal Omega panel.
//
// The two answer different questions and neither subsumes the other. The live
// panel spans 13 curated species down to yeast and plants, carries CDD domains
// on every row, and costs a Clustal Omega round trip that can run to a minute.
// This one is 100 vertebrates, is a single random read of an indexed bgzip file,
// and has no domains — the alignment is precomputed, so it appears instantly.
// The page offers both for human and lets the reader pick.
//
// Three sidecars sit beside the `.fa.gz`, all found by suffix:
//   .gzi  the bgzip index, so a block can be read by uncompressed offset
//   .idx  gene symbol -> {offset,length} of that gene's FASTA block
//   .cds  gene symbol -> the hg38 knownCanonical coding-exon model the alignment
//         was built from
//
// The `.cds` model is the reason this is more than an alignment: it is the SAME
// transcript the alignment's hg38 row translates, so a connectedFeature built
// from it shares the alignment's codon ordinals and the genome/alignment/
// structure highlight lands on the right residue. The NCBI gene_table transcript
// the rest of the page uses is a different isoform pick, and pairing it with
// this alignment would offset the mapping.
//
// Built by react-msaview's scripts/gene-explorer/build-data.mjs from the UCSC
// knownCanonical 100-way exon-AA; served from the jbrowse.org bucket with
// `access-control-allow-origin: *` and range requests exposed.

import { BgzfFilehandle } from '@gmod/bgzf-filehandle'
import { RemoteFile } from 'generic-filehandle2'

import type { CDS, Transcript } from './geneStructure.ts'

// Where the alignment and its sidecars live. This url is baked into every
// launched session that names the indexed alignment (HUNDRED_WAY_MSA and
// HUNDRED_WAY_TREE ride in the bookmarkable session url), so it should be
// promoted out of `demos/` before those urls are treated as permanent — moving
// the files afterwards breaks every saved link.
const HUNDRED_WAY_BASE = 'https://jbrowse.org/demos/msaview/100way'
const MSA_GZ = `${HUNDRED_WAY_BASE}/hg38.knownCanonical.multiz100way.aa.fa.gz`

export const HUNDRED_WAY_TREE = `${HUNDRED_WAY_BASE}/hg38.multiz100way.nh`
export const HUNDRED_WAY_MSA = MSA_GZ

// The alignment is hg38 knownCanonical, so it exists for human alone.
export const HUNDRED_WAY_TAXON = 9606

let bgzf: BgzfFilehandle | undefined
function getBgzf() {
  bgzf ??= new BgzfFilehandle({
    filehandle: new RemoteFile(MSA_GZ),
    gziFilehandle: new RemoteFile(`${MSA_GZ}.gzi`),
  })
  return bgzf
}

// Fetch a text sidecar once and parse it into a lookup map, memoizing the
// promise. A failed fetch clears the memo, so a transient error doesn't wedge
// every later lookup on a cached rejection; the next call retries.
function memoizedTextIndex<T>(url: string, parse: (text: string) => T) {
  let cached: Promise<T> | undefined
  return () => {
    cached ??= fetch(url)
      .then(res => {
        if (!res.ok) {
          throw new Error(`${url} (${res.status})`)
        }
        return res.text()
      })
      .then(parse)
      .catch((e: unknown) => {
        cached = undefined
        throw e
      })
    return cached
  }
}

// gene symbol -> {offset,length} into the uncompressed bgzip stream. ~470 KB.
const getMsaIndex = memoizedTextIndex(
  `${MSA_GZ}.idx`,
  text =>
    new Map(
      text
        .trim()
        .split('\n')
        .map((line): [string, { offset: number; length: number }] => {
          const [id = '', offset, length] = line.split('\t')
          return [id, { offset: Number(offset), length: Number(length) }]
        }),
    ),
)

// gene symbol -> the knownCanonical CDS model. ~4.7 MB, fetched once.
const getCdsIndex = memoizedTextIndex(
  `${MSA_GZ}.cds`,
  text =>
    new Map(
      text
        .trim()
        .split('\n')
        .map((line): [string, HundredWayTranscript] => {
          const [symbol = '', name = '', refName = '', strand, spec = ''] =
            line.split('\t')
          const cds = spec.split(',').map((s): CDS => {
            const [start, end, phase] = s.split(':')
            return {
              start: Number(start),
              end: Number(end),
              phase: Number(phase),
            }
          })
          return [
            symbol,
            {
              refName,
              strand: strand === '-' ? -1 : 1,
              name,
              geneName: symbol,
              cds,
            },
          ]
        }),
    ),
)

// The sidecar names sequences the UCSC way (chr17), which is canonical on the
// /ucsc/hg38 config a human session opens — no rename needed, unlike the NCBI
// accessions the rest of the page resolves.
type HundredWayTranscript = Transcript

export interface HundredWayAlignment {
  fasta: string
  querySeqName: string // 'hg38', the first row
  rowCount: number
  // the aligned hg38 row with its gaps removed: the knownCanonical translation,
  // and so the protein whose codon ordinals connectedFeature shares
  querySequence: string
}

// The residues of one FASTA record, header line dropped.
function fastaBody(record: string) {
  const [, ...seqLines] = record.trim().split('\n')
  return seqLines.join('')
}

// One gene's alignment: look the symbol up in the name index, random-read its
// FASTA block, and return it as-is — the block is already valid FASTA
// (`>hg38\nSEQ\n>panTro4\nSEQ…`) with the human row first.
export async function fetchHundredWayAlignment(
  symbol: string,
): Promise<HundredWayAlignment | undefined> {
  const entry = (await getMsaIndex()).get(symbol)
  if (!entry) {
    return undefined
  }
  const bytes = await getBgzf().read(entry.length, entry.offset)
  const fasta = new TextDecoder().decode(bytes).trim()
  return {
    fasta,
    querySeqName: 'hg38',
    rowCount: (fasta.match(/^>/gm) ?? []).length,
    querySequence: fastaBody(fasta.split(/\n>/)[0] ?? '').replaceAll('-', ''),
  }
}

// The transcript the alignment was built from. Undefined for a gene outside the
// knownCanonical set, which is the same set fetchHundredWayAlignment covers.
export async function fetchHundredWayTranscript(
  symbol: string,
): Promise<Transcript | undefined> {
  return (await getCdsIndex()).get(symbol)
}

// Whether this gene has a 100-way alignment at all, so the page can offer the
// choice only where there is one. Both indexes are memoized, so asking is free
// after the first gene. An unreachable index reads as "no alignment" rather than
// an error: the live panel is always available as the other source.
export async function hasHundredWay(
  symbol: string,
  taxId: number,
): Promise<boolean> {
  if (taxId !== HUNDRED_WAY_TAXON) {
    return false
  }
  return getMsaIndex()
    .then(index => index.has(symbol))
    .catch(() => false)
}
