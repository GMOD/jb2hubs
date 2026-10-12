// What an edit at a residue does to the protein, from the launched transcript's
// own coding exons: a stop (a nonsense variant) either hands the mRNA to
// nonsense-mediated decay or makes a truncated protein, and skipping the
// residue's exon deletes residues in frame or shifts the frame. The arithmetic
// counts on the translation, so `lost` goes straight to the session as
// `initialTranscriptResidues`; `shown` is the same residues in the map's
// numbering, for the page.

import type { Transcript } from './geneStructure.ts'
import type { ProteinRegion } from './proteinRegions.ts'
import type { ResidueRange } from './proteinSession.ts'

export type Edit = 'stop' | 'skip'
export const EDITS: Edit[] = ['stop', 'skip']

// aenmd's escape rules (Klonowski et al. 2023, kostkalab/aenmd
// R/nmd_escape_rules.R), from Lindeboom et al. 2016 and 2019. Like aenmd they
// count coding exons only, so an intron in the 3′ UTR (ARC's two) goes unseen:
// none of 18 common disease genes has one, and the 100-way's models carry no
// UTR to read it from.
const PENULTIMATE_NT = 50
const START_PROXIMAL_NT = 150
const LONG_EXON_NT = 407

// Why a stop escapes decay, or 'nmd' where none applies.
export type NmdCall = 'last' | 'penultimate' | 'start' | 'long-exon' | 'nmd'

export interface StopConsequence {
  kind: 'stop'
  // 1-based coding exon in translation order, of how many
  exon: number
  exons: number
  // nt from the stop codon's first base to the last junction between coding
  // exons; undefined in the last coding exon
  toLastJunction?: number
  // nt from the start codon's first base to the stop's
  fromStart: number
  exonLength: number
  nmd: NmdCall
  // residues translated before the stop
  made: number
  lost: ResidueRange[]
  shown?: readonly ResidueRange[]
}

export interface SkipConsequence {
  kind: 'skip'
  exon: number
  exons: number
  codingLength: number
  inFrame: boolean
  // whether the exon starts between codons; one that starts inside a codon
  // fuses the codons split at either end into one
  onCodonBoundary: boolean
  // in frame, the residues deleted or fused; out of frame, from the first
  // changed residue to the end
  lost: ResidueRange[]
  shown?: readonly ResidueRange[]
}

export type EditConsequence = StopConsequence | SkipConsequence

// The coding exons in translation order, each with the coding offset (nt,
// 0-based) it starts at.
function codingBlocks(transcript: Transcript) {
  const order =
    transcript.strand === 1 ? transcript.cds : [...transcript.cds].reverse()
  let offset = 0
  return order.map(c => {
    const start = offset
    offset += c.end - c.start
    return { start, length: c.end - c.start }
  })
}

const residueOf = (codingOffset: number) => Math.floor(codingOffset / 3) + 1

function nmdCall(
  last: boolean,
  toLastJunction: number | undefined,
  fromStart: number,
  exonLength: number,
): NmdCall {
  if (last) {
    return 'last'
  }
  if (toLastJunction !== undefined && toLastJunction < PENULTIMATE_NT) {
    return 'penultimate'
  }
  if (fromStart < START_PROXIMAL_NT) {
    return 'start'
  }
  return exonLength >= LONG_EXON_NT ? 'long-exon' : 'nmd'
}

// `position` is a 1-based residue of the translation, `length` its residues.
export function editConsequence(
  transcript: Transcript,
  length: number,
  position: number,
  edit: Edit,
): EditConsequence | undefined {
  const blocks = codingBlocks(transcript)
  const codon = (position - 1) * 3
  const k = blocks.findIndex(
    b => b.start <= codon && codon < b.start + b.length,
  )
  if (k < 0 || position < 1 || position > length) {
    return undefined
  }
  const exons = blocks.length
  const block = blocks[k]!
  if (edit === 'stop') {
    const last = k === exons - 1
    const toLastJunction = last ? undefined : blocks[exons - 1]!.start - codon
    return {
      kind: 'stop',
      exon: k + 1,
      exons,
      toLastJunction,
      fromStart: codon,
      exonLength: block.length,
      nmd: nmdCall(last, toLastJunction, codon, block.length),
      made: position - 1,
      lost: [{ start: position, end: length }],
    }
  }
  // the first and last coding exons carry the start and the stop; skipping
  // either is not a splice edit
  if (k === 0 || k === exons - 1) {
    return undefined
  }
  const first = residueOf(block.start)
  const inFrame = block.length % 3 === 0
  return {
    kind: 'skip',
    exon: k + 1,
    exons,
    codingLength: block.length,
    inFrame,
    onCodonBoundary: block.start % 3 === 0,
    lost: [
      {
        start: first,
        end: inFrame
          ? Math.min(length, residueOf(block.start + block.length - 1))
          : length,
      },
    ],
  }
}

const span = ({ start, end }: ResidueRange) =>
  start === end ? `${start}` : `${start}–${end}`

// The lost residues as the page numbers them: the first to the last of
// `shown`, or nothing where they do not carry onto the map's numbering.
function shownSpan(c: EditConsequence) {
  const shown = c.shown ?? c.lost
  const first = shown[0]
  const last = shown.at(-1)
  return first && last ? { start: first.start, end: last.end } : undefined
}

// The domains the lost residues reach into, in the map's numbering.
function domainsIn(c: EditConsequence, regions: ProteinRegion[] | undefined) {
  const shown = c.shown ?? c.lost
  const names = [
    ...new Set(
      (regions ?? [])
        .filter(
          r =>
            (r.kind === 'domain' || r.kind === 'repeat') &&
            shown.some(l => r.start <= l.end && l.start <= r.end),
        )
        .map(r => r.name),
    ),
  ]
  return names.length
    ? `, including the ${names.slice(0, 2).join(' and ')}${names.length > 2 ? ` and ${names.length - 2} more` : ''}`
    : ''
}

// One line for the fold.
export function editLine(
  c: EditConsequence,
  label: string,
  regions?: ProteinRegion[],
) {
  const lost = shownSpan(c)
  const missing = lost ? `, missing ${span(lost)}${domainsIn(c, regions)}` : ''
  if (c.kind === 'skip') {
    if (!c.inFrame) {
      return `Skipping coding exon ${c.exon} of ${c.exons} (${c.codingLength} nt) shifts the reading frame${lost ? ` from residue ${lost.start}` : ''}.`
    }
    const what = c.onCodonBoundary ? 'deletes residues' : 'fuses residues'
    return lost
      ? `Skipping coding exon ${c.exon} of ${c.exons} (${c.codingLength} nt, in frame) ${what} ${span(lost)}${c.onCodonBoundary ? '' : ' into one'}${domainsIn(c, regions)}.`
      : `Skipping coding exon ${c.exon} of ${c.exons} (${c.codingLength} nt) keeps the reading frame.`
  }
  const made = `a protein of ${c.made} residues is made${missing}`
  const at = `A stop at ${label}`
  switch (c.nmd) {
    case 'last':
      return `${at} is in the last coding exon (${c.exon} of ${c.exons}), so the transcript escapes nonsense-mediated decay and ${made}.`
    case 'penultimate':
      return `${at} is ${c.toLastJunction} nt before the last exon junction, inside the ${PENULTIMATE_NT} nt that escape nonsense-mediated decay, so ${made}.`
    case 'start':
      return `${at} is ${c.fromStart} nt into the coding sequence, inside the first ${START_PROXIMAL_NT} nt, where ribosomes can restart at a later start codon and the transcript often escapes nonsense-mediated decay.`
    case 'long-exon':
      return `${at} is in coding exon ${c.exon} of ${c.exons}, which at ${c.exonLength} nt is long enough that the transcript often escapes nonsense-mediated decay; if it does, ${made}.`
    case 'nmd':
      return `${at} is in coding exon ${c.exon} of ${c.exons}, ${c.toLastJunction} nt before the last exon junction, so the transcript is a likely target for nonsense-mediated decay.`
  }
}

// What the Open button says the session opens on.
export function editOpens(c: EditConsequence, label: string) {
  const lost = c.lost[0]!
  const shown = shownSpan(c)
  if (c.kind === 'stop') {
    return `the ${lost.end - lost.start + 1} residues a stop at ${label} removes`
  }
  if (!shown) {
    return `the residues skipping exon ${c.exon} changes`
  }
  return c.inFrame
    ? `residues ${span(shown)}, ${c.onCodonBoundary ? 'deleted' : 'fused'} by skipping exon ${c.exon}`
    : `the residues from ${shown.start}, shifted by skipping exon ${c.exon}`
}
