// What the session opens on, and how it is carried from the canonical onto the
// launched translation: a region of the map or one residue, the residues it
// names, and the chip, link and box forms it is read from.

import { alignmentTooLarge, sharedIsoformResidues } from 'p2s_mapper'

import { canonicalSequence } from './geneStructure.ts'
import { sharedCodons } from './isoformCodons.ts'

import type { Edit } from './editConsequence.ts'
import type { ExampleFocus } from './geneExamples.ts'
import type { GeneStructure } from './geneStructure.ts'
import type { ProteinRegion } from './proteinRegions.ts'
import type { ResidueRange } from './proteinSession.ts'

// Contiguous runs of an interface's residues, merged across gaps of up to
// `tolerance` — what the map draws instead of one bar from first to last.
export function residueRuns(residues: number[], tolerance = 2) {
  const runs: { start: number; end: number }[] = []
  for (const p of residues) {
    const last = runs.at(-1)
    if (last && p - last.end <= tolerance + 1) {
      last.end = p
    } else {
      runs.push({ start: p, end: p })
    }
  }
  return runs
}

// The narrowest domain or repeat holding a position — what a residue focus
// (R248) belongs to, and so which family alignment to offer for it.
export function regionContaining(regions: ProteinRegion[], position: number) {
  return regions
    .filter(
      r =>
        (r.kind === 'domain' || r.kind === 'repeat') &&
        r.start <= position &&
        position <= r.end,
    )
    .toSorted((a, b) => a.end - a.start - (b.end - b.start))[0]
}

// Whether two regions are the same one, for a toggle.
function sameRegion(a: ProteinRegion, b: ProteinRegion) {
  return (
    a.kind === b.kind &&
    a.accession === b.accession &&
    a.start === b.start &&
    a.end === b.end
  )
}

// What the session opens on: a region of the map, or one residue the reader
// named (a hotspot, a variant). Both are on the canonical sequence.
export type Focus =
  | { kind: 'region'; region: ProteinRegion }
  | { kind: 'residue'; position: number; label?: string; edit?: Edit }

// The residues a focus names. An interface is its contact runs, as the map
// draws them: TP53's homo-oligomer contacts span 17–356 end to end.
export function focusRanges(focus: Focus): ResidueRange[] {
  if (focus.kind === 'residue') {
    return [{ start: focus.position, end: focus.position }]
  }
  const { start, end, residues } = focus.region
  return residues?.length ? residueRuns(residues) : [{ start, end }]
}

// The alignment behind translationRanges is up to 40M cells (KMT2A), and a
// render asks for the same pair several times, in both directions; the
// reverse is the forward map inverted, so a residue carried there and back
// lands where it started.
const sharedCache = new Map<string, Map<number, number>>()
function sharedResidues(from: string, translation: string) {
  const key = `${from}>${translation}`
  let shared = sharedCache.get(key)
  if (!shared) {
    const reverse = sharedCache.get(`${translation}>${from}`)
    shared = reverse
      ? new Map([...reverse].map(([a, b]) => [b, a]))
      : sharedIsoformResidues(from, translation)
    if (sharedCache.size >= 4) {
      sharedCache.delete(sharedCache.keys().next().value!)
    }
    sharedCache.set(key, shared)
  }
  return shared
}

function carried(ranges: readonly ResidueRange[], onto: Map<number, number>) {
  const runs: ResidueRange[] = []
  for (const { start, end } of ranges) {
    for (let residue = start; residue <= end; residue++) {
      const index = onto.get(residue - 1)
      if (index !== undefined) {
        const last = runs.at(-1)
        if (last?.end === index) {
          last.end = index + 1
        } else {
          runs.push({ start: index + 1, end: index + 1 })
        }
      }
    }
  }
  return runs
}

// Ranges on one isoform carried onto another's translation, split wherever the
// translation lacks residues and dropped where it lacks them all. Undefined
// for a pair too long to align. A residue carries only inside a stretch the two
// spell letter for letter (p2s_mapper's sharedIsoformResidues, which carries
// the 2026-09-25 measurement), so a paralogous exon carries nothing.
export function translationRanges(
  ranges: readonly ResidueRange[],
  from: string,
  translation: string,
) {
  return from === translation
    ? ranges
    : alignmentTooLarge(translation.length, from.length)
      ? undefined
      : carried(ranges, sharedResidues(from, translation))
}

// The canonical's residues on the launched translation's, by the codons the
// two transcripts share. Only where a RefSeq isoform spells the canonical;
// otherwise the two proteins are aligned (translationRanges).
const codonCache = new WeakMap<GeneStructure, Map<number, number>>()
function canonicalCodons(structure: GeneStructure) {
  const { canonicalIsoform } = structure
  const cached = codonCache.get(structure)
  const shared =
    cached ??
    (canonicalIsoform
      ? sharedCodons(canonicalIsoform.transcript, structure.transcript)
      : undefined)
  if (shared && !cached) {
    codonCache.set(structure, shared)
  }
  return shared
}

function inverted(map: Map<number, number>) {
  return new Map([...map].map(([a, b]) => [b, a]))
}

function unmapped(length: number, mapped: Set<number>) {
  return residueRuns(
    Array.from({ length }, (_, i) => i).flatMap(i =>
      mapped.has(i) ? [] : [i + 1],
    ),
    0,
  )
}

// The residues each of the two isoforms has to itself, 1-based: an exon the
// other skips or swaps for another, and the codons split across its junctions.
export function privateResidues(structure: GeneStructure) {
  const shared = canonicalCodons(structure)
  const { canonical, proteinSequence } = structure
  return shared && canonical && proteinSequence
    ? {
        canonical: unmapped(canonical.length, new Set(shared.keys())),
        launched: unmapped(proteinSequence.length, new Set(shared.values())),
      }
    : undefined
}

// A focus is numbered on the canonical, and the plugin lights residues of the
// launched translation. Undefined where either sequence is missing or the pair
// is too long to align (TTN): canonical numbers read as the translation's land
// thousands of residues off, on a neighbouring repeat.
export function toTranslation(
  structure: GeneStructure,
  ranges: readonly ResidueRange[],
) {
  const codons = canonicalCodons(structure)
  const canonical = canonicalSequence(structure)
  const translation = structure.proteinSequence
  return codons
    ? carried(ranges, codons)
    : canonical && translation
      ? translationRanges(ranges, canonical, translation)
      : undefined
}

// The translation's residues back on the canonical the map counts on
export function toCanonical(
  structure: GeneStructure,
  ranges: readonly ResidueRange[],
) {
  const codons = canonicalCodons(structure)
  const canonical = canonicalSequence(structure)
  const translation = structure.proteinSequence
  return codons
    ? carried(ranges, inverted(codons))
    : canonical && translation
      ? translationRanges(ranges, translation, canonical)
      : undefined
}

// The variant or residue a label names (E6V, R248, S450L): wild type, number
// and, for a variant, the new residue.
export function namedResidue(label: string | undefined) {
  return /\b([A-Z])(\d+)([A-Z*])?(?!\w)/.exec(label ?? '')
}

// What the ruler's flag calls a residue: the one its label names, else its
// number.
export function residueFlag(focus: { position: number; label?: string }) {
  return namedResidue(focus.label)?.[0] ?? String(focus.position)
}

export function focusLabel(focus: Focus) {
  if (focus.kind === 'residue') {
    return focus.label ?? `residue ${focus.position}`
  }
  const { region } = focus
  const span =
    region.start === region.end
      ? `${region.start}`
      : `${region.start}–${region.end}`
  return region.kind === 'interface'
    ? `${region.name} interface ${span}`
    : region.kind === 'ligand'
      ? `${region.name} site ${span}`
      : `${region.name} ${span}`
}

const THREE_LETTER: Record<string, string> = {
  ALA: 'A',
  ARG: 'R',
  ASN: 'N',
  ASP: 'D',
  CYS: 'C',
  GLN: 'Q',
  GLU: 'E',
  GLY: 'G',
  HIS: 'H',
  ILE: 'I',
  LEU: 'L',
  LYS: 'K',
  MET: 'M',
  PHE: 'F',
  PRO: 'P',
  SER: 'S',
  THR: 'T',
  TRP: 'W',
  TYR: 'Y',
  VAL: 'V',
  SEC: 'U',
  TER: '*',
}

const ONE_LETTER = /^[ACDEFGHIKLMNPQRSTVWYU*]$/

function aminoAcid(code: string | undefined) {
  if (!code) {
    return undefined
  }
  const upper = code.toUpperCase()
  return upper.length === 3
    ? THREE_LETTER[upper]
    : ONE_LETTER.test(upper)
      ? upper
      : undefined
}

// What the residue box reads: a position, or a variant the way a paper writes
// one — `248`, `R248`, `V600E`, `p.R175H`, `p.Arg248Gln`. A wild-type letter
// is checked against the sequence, because a mismatch is almost always another
// numbering: the sickle mutation is E6V in the literature and Glu7 here.
export function parseResidue(
  text: string,
  sequence: string | undefined,
  length: number,
): { position: number; label?: string } | { error: string } {
  const compact = text.replaceAll(/[\s()]/g, '')
  const m =
    /^(?:p\.)?([A-Za-z]{3}|[A-Za-z])?(\d+)([A-Za-z]{3}|[A-Za-z*])?$/.exec(
      compact,
    )
  const wildType = aminoAcid(m?.[1])
  const variant = aminoAcid(m?.[3])
  if (!m || (m[1] && !wildType) || (m[3] && !variant)) {
    return {
      error: compact
        ? `${compact} is not a residue: type a position (248) or a variant (R248Q, p.Arg248Gln).`
        : 'Type a position (248) or a variant (R248Q, p.Arg248Gln).',
    }
  }
  const position = Number(m[2])
  if (position < 1 || position > length) {
    return {
      error: `Residue ${position} is not on this protein, which runs 1–${length}.`,
    }
  }
  const actual = sequence?.[position - 1]
  if (wildType && actual && wildType !== actual) {
    const next = sequence[position] === wildType
    return {
      error: `Residue ${position} is ${actual}, not ${wildType}.${next ? ` Residue ${position + 1} is ${wildType}, which a numbering without the initiator methionine calls ${position}.` : ''}`,
    }
  }
  const letter = wildType ?? actual
  return letter
    ? { position, label: `${letter}${position}${variant ?? ''}` }
    : { position }
}

export function sameFocus(a: Focus | undefined, b: Focus | undefined) {
  if (!a || !b || a.kind !== b.kind) {
    return a === b
  }
  return a.kind === 'region' && b.kind === 'region'
    ? sameRegion(a.region, b.region)
    : a.kind === 'residue' && b.kind === 'residue' && a.position === b.position
}

// The domain whose Pfam seed a focus can open with: the focused domain itself,
// or the narrowest domain whose Pfam match a focused residue sits in. A seed
// row covers only the match, so a residue outside it would be missing from the
// query row: HBB's E7 sits in InterPro's Globin entry (3–147) but before its
// PF00042 match (27–142). An interface or a ligand site is a patch on whatever
// domains it crosses, not a family, so it offers none.
export function focusFamily(
  focus: Focus | undefined,
  regions: ProteinRegion[],
) {
  if (!focus) {
    return undefined
  }
  if (focus.kind === 'region') {
    const { region } = focus
    return region.pfam &&
      region.kind !== 'interface' &&
      region.kind !== 'ligand'
      ? region
      : undefined
  }
  const { position } = focus
  return regionContaining(
    regions.filter(r => {
      const match = r.pfamSpan ?? r
      return r.pfam && match.start <= position && position <= match.end
    }),
    position,
  )
}

// Which of a chip's presets the map can honour yet: a residue at once, a
// family once InterPro has answered, a partner or a ligand once PDBe has.
export function focusFromPreset(
  preset: ExampleFocus | undefined,
  regions: ProteinRegion[] | undefined,
  partners: ProteinRegion[] | undefined,
  ligands?: ProteinRegion[],
): Focus | undefined {
  if (preset?.residue) {
    return {
      kind: 'residue',
      position: preset.residue,
      label: preset.residueLabel,
      edit: preset.edit,
    }
  }
  const region = preset?.pfam
    ? (regions?.find(r => r.pfam === preset.pfam && r.start === preset.start) ??
      regions?.find(r => r.pfam === preset.pfam))
    : preset?.partner
      ? partners?.find(r => r.accession === preset.partner)
      : preset?.ligand
        ? ligands?.find(r => r.accession === preset.ligand)
        : undefined
  return region ? { kind: 'region', region } : undefined
}

// A focus in the shape a chip or a link names one, for the url: a residue, a
// binding partner, a ligand or a Pfam family. A region with none of those
// names, such as a site, is not carried.
export function presetOf(focus: Focus | undefined): ExampleFocus | undefined {
  if (!focus) {
    return undefined
  }
  if (focus.kind === 'residue') {
    return {
      residue: focus.position,
      residueLabel: focus.label,
      edit: focus.edit,
    }
  }
  const { region } = focus
  return region.kind === 'interface' && region.accession
    ? { partner: region.accession }
    : region.kind === 'ligand' && region.accession
      ? { ligand: region.accession }
      : region.pfam
        ? { pfam: region.pfam, start: region.start }
        : undefined
}
