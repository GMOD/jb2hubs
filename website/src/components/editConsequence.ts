// What an edit at a residue does to the protein, from the launched transcript's
// own coding exons: a stop (a nonsense variant, a CRISPR frameshift) either
// hands the mRNA to nonsense-mediated decay or makes a truncated protein, and
// skipping the residue's exon deletes residues in frame or shifts the frame.
// Everything here counts on the translation, so the ranges go straight to the
// session as `initialTranscriptResidues` with no isoform mapping.

import type { Transcript } from './geneStructure.ts'
import type { ProteinRegion } from './proteinRegions.ts'
import type { ResidueRange } from './proteinSession.ts'

export type Edit = 'stop' | 'skip'
export const EDITS: Edit[] = ['stop', 'skip']

// The 50–55 nt rule (Nagy & Maquat 1998): a stop more than ~50–55 nt before
// the last exon junction is a target for nonsense-mediated decay; one inside
// that window, or in the last exon, escapes it and a truncated protein is made.
const NMD_ESCAPE_NT = 50
const NMD_TARGET_NT = 55

export type NmdCall = 'likely' | 'unlikely' | 'borderline'

export interface StopConsequence {
  kind: 'stop'
  // 1-based coding exon in translation order, of how many
  exon: number
  exons: number
  // nt from the stop codon's first base to the last junction between coding
  // exons; undefined in the last coding exon
  toLastJunction?: number
  nmd: NmdCall
  // residues translated before the stop
  made: number
  lost: ResidueRange[]
}

export interface SkipConsequence {
  kind: 'skip'
  exon: number
  exons: number
  codingLength: number
  inFrame: boolean
  // in frame, the residues deleted; out of frame, from the first changed
  // residue to the end
  lost: ResidueRange[]
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

// `position` is a 1-based residue of the translation, `length` its residues.
export function editConsequence(
  transcript: Transcript,
  length: number,
  position: number,
  edit: Edit,
): EditConsequence | undefined {
  const blocks = codingBlocks(transcript)
  const codon = (position - 1) * 3
  const k = blocks.findIndex(b => b.start <= codon && codon < b.start + b.length)
  if (k < 0 || position < 1 || position > length) {
    return undefined
  }
  const exons = blocks.length
  if (edit === 'stop') {
    const last = k === exons - 1
    const toLastJunction = last ? undefined : blocks[exons - 1]!.start - codon
    return {
      kind: 'stop',
      exon: k + 1,
      exons,
      toLastJunction,
      nmd:
        toLastJunction === undefined || toLastJunction < NMD_ESCAPE_NT
          ? 'unlikely'
          : toLastJunction >= NMD_TARGET_NT
            ? 'likely'
            : 'borderline',
      made: position - 1,
      lost: [{ start: position, end: length }],
    }
  }
  // the first and last coding exons carry the start and the stop; skipping
  // either is not a splice edit
  if (k === 0 || k === exons - 1) {
    return undefined
  }
  const block = blocks[k]!
  const first = residueOf(block.start)
  const inFrame = block.length % 3 === 0
  return {
    kind: 'skip',
    exon: k + 1,
    exons,
    codingLength: block.length,
    inFrame,
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

// The domains the lost residues reach into, named only when the regions count
// on the same numbering as the translation.
function domainsIn(lost: ResidueRange[], regions: ProteinRegion[] | undefined) {
  const names = [
    ...new Set(
      (regions ?? [])
        .filter(
          r =>
            (r.kind === 'domain' || r.kind === 'repeat') &&
            lost.some(l => r.start <= l.end && l.start <= r.end),
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
  const lost = c.lost[0]!
  if (c.kind === 'skip') {
    return c.inFrame
      ? `Skipping coding exon ${c.exon} of ${c.exons} (${c.codingLength} nt, in frame) deletes residues ${span(lost)}${domainsIn(c.lost, regions)}.`
      : `Skipping coding exon ${c.exon} of ${c.exons} (${c.codingLength} nt) shifts the reading frame from residue ${lost.start}.`
  }
  const where =
    c.toLastJunction === undefined
      ? `in the last coding exon (${c.exon} of ${c.exons})`
      : `in coding exon ${c.exon} of ${c.exons}, ${c.toLastJunction} nt before the last junction`
  const made = `a protein of ${c.made} residues is made, missing ${span(lost)}${domainsIn(c.lost, regions)}`
  switch (c.nmd) {
    case 'likely':
      return `A stop at ${label} is ${where}, so the transcript is a likely target for nonsense-mediated decay.`
    case 'borderline':
      return `A stop at ${label} is ${where}, at the edge of the 50–55 nt rule for nonsense-mediated decay; if it escapes, ${made}.`
    case 'unlikely':
      return `A stop at ${label} is ${where}, so the transcript escapes nonsense-mediated decay and ${made}.`
  }
}

// What the Open button says the session opens on.
export function editOpens(c: EditConsequence, label: string) {
  const lost = c.lost[0]!
  if (c.kind === 'stop') {
    return `the ${lost.end - lost.start + 1} residues a stop at ${label} removes`
  }
  return c.inFrame
    ? `residues ${span(lost)}, deleted by skipping exon ${c.exon}`
    : `the residues from ${lost.start}, shifted by skipping exon ${c.exon}`
}
