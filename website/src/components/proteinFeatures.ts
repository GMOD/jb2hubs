// Regions of one protein worth opening a session on, from two services that
// answer by UniProt accession and allow cross-origin reads:
//
//  - InterPro (entry/all/protein/uniprot/<acc>): every member-database match on
//    the canonical sequence, integrated into InterPro entries. The domain
//    vocabulary the field shares — and the Pfam accession under each domain is
//    what has a curated seed alignment (see pfamSeed.ts).
//  - PDBe-KB graph API (uniprot/interface_residues/<acc>): every residue seen at
//    an interface with another molecule in any PDB entry, grouped by partner.
//    Which residues bind MDM2, which bind DNA, which face the other subunit —
//    and the entries that show it, which is what the session opens as a
//    complex rather than a monomer.
//
// Both sets of coordinates are on the UniProt canonical sequence, 1-based
// inclusive. The launched transcript may translate to another isoform, and
// where it does `translationRanges` carries a focus across by alignment.
//
// Measured 2026-09-11: InterPro answers TP53 in 13 KB (22 entries, 2 pages at
// page_size 50 for NOTCH1's 56); the interface list is 496 KB for TP53 and
// 504 KB for HBB — well-studied extremes, 9.5 KB for zebrafish tp53 — so it is
// fetched only when the reader opens the partner list.

import { alignmentTooLarge, needlemanWunsch } from 'p2s_mapper'

import type { ExampleFocus } from './geneExamples.ts'
import type { ResidueRange } from './proteinSession.ts'

export type RegionKind = 'domain' | 'repeat' | 'site' | 'interface' | 'residue'

export interface ProteinRegion {
  kind: RegionKind
  name: string
  // 1-based inclusive residues on the UniProt canonical sequence
  start: number
  end: number
  // InterPro accession for a domain/site; the partner's accession for an
  // interface (or `DNA`/`RNA`)
  accession?: string
  // the Pfam family under this entry, which is what has a seed alignment
  pfam?: string
  // interface only: which residues actually touch the partner, and which PDB
  // entries hold the complex, most-covering first
  residues?: number[]
  pdbIds?: string[]
}

// --- InterPro -----------------------------------------------------------------

const INTERPRO = 'https://www.ebi.ac.uk/interpro/api'

interface InterProResult {
  metadata?: {
    accession?: string
    name?: string
    source_database?: string
    type?: string
    integrated?: string | null
  }
  proteins?: {
    entry_protein_locations?: {
      fragments?: { start?: number; end?: number }[]
    }[]
  }[]
}

interface InterProPage {
  count?: number
  next?: string | null
  results?: InterProResult[]
}

// Which InterPro entry types are regions of a protein, as opposed to a
// classification of the whole thing (family, homologous_superfamily) — those
// span the protein and say nothing about where to look.
const REGION_TYPES: Record<string, RegionKind> = {
  domain: 'domain',
  repeat: 'repeat',
  conserved_site: 'site',
  active_site: 'site',
  binding_site: 'site',
  ptm: 'site',
}

function fragments(result: InterProResult) {
  return (result.proteins?.[0]?.entry_protein_locations ?? []).flatMap(loc =>
    (loc.fragments ?? []).flatMap(f =>
      f.start !== undefined && f.end !== undefined
        ? [{ start: f.start, end: f.end }]
        : [],
    ),
  )
}

// One region per fragment of every InterPro entry that is a region, carrying
// the Pfam accession of the member entry integrated into it. A Pfam entry
// InterPro has not integrated is a region in its own right, since it still has
// a seed alignment; every other member database's unintegrated matches are
// left out — they are the signal InterPro's curators have not yet accepted.
export function parseInterProRegions(pages: InterProPage[]): ProteinRegion[] {
  const results = pages.flatMap(p => p.results ?? [])
  const pfamByEntry = new Map<string, string>()
  for (const r of results) {
    const m = r.metadata
    if (m?.source_database === 'pfam' && m.integrated && m.accession) {
      pfamByEntry.set(m.integrated, m.accession)
    }
  }
  const regions: ProteinRegion[] = []
  for (const r of results) {
    const m = r.metadata
    if (!m?.accession) {
      continue
    }
    const kind = REGION_TYPES[m.type ?? '']
    const interpro = m.source_database === 'interpro'
    const loosePfam = m.source_database === 'pfam' && !m.integrated
    if (!kind || !(interpro || loosePfam)) {
      continue
    }
    const pfam = interpro ? pfamByEntry.get(m.accession) : m.accession
    for (const { start, end } of fragments(r)) {
      regions.push({
        kind,
        name: m.name ?? m.accession,
        start,
        end,
        accession: m.accession,
        ...(pfam ? { pfam } : {}),
      })
    }
  }
  return regions.sort((a, b) => a.start - b.start || b.end - a.end)
}

const MAX_INTERPRO_PAGES = 10

// Every InterPro entry matched on the accession, paged. A 204 is InterPro's
// answer for a protein with no matches, and a protein it has never seen is a
// 404; both are "no regions", not errors.
export async function fetchInterProRegions(
  uniprotId: string,
): Promise<ProteinRegion[]> {
  const pages: InterProPage[] = []
  let url: string | null | undefined =
    `${INTERPRO}/entry/all/protein/uniprot/${encodeURIComponent(uniprotId)}?page_size=100`
  for (let i = 0; url && i < MAX_INTERPRO_PAGES; i++) {
    const res = await fetch(url, { headers: { Accept: 'application/json' } })
    if (res.status === 204 || res.status === 404) {
      break
    }
    if (!res.ok) {
      throw new Error(`InterPro ${res.status} for ${uniprotId}`)
    }
    const page = (await res.json()) as InterProPage
    pages.push(page)
    url = page.next
  }
  return parseInterProRegions(pages)
}

// --- PDBe-KB interfaces --------------------------------------------------------

const PDBE_GRAPH = 'https://www.ebi.ac.uk/pdbe/graph-api'

interface InterfacePartner {
  name?: string
  accession?: string
  residues?: {
    startIndex?: number
    endIndex?: number
    allPDBEntries?: string[]
  }[]
}

interface InterfaceSummary {
  length?: number
  data?: InterfacePartner[]
}

// How many partners to keep. TP53 has 56, most of them a single peptide
// crystallised once; the residue count is what ranks the ones worth a click.
const MAX_PARTNERS = 12
const MAX_PDB_PER_PARTNER = 6

// Partners with no molecule behind them: PDBe files unassigned chains under
// `Other`, and a fusion or crystallisation tag is a partner in the file but
// not in the cell. TP53 lists E. coli maltose-binding protein (its DNA-binding
// core is crystallised as an MBP fusion) and GFP; the viral partners beside
// them (E6, large T antigen) are real biology and stay.
const NOT_A_PARTNER = new Set(['Other', 'other', ''])
const FUSION_TAGS = new Set([
  'P0AEX9', // maltose-binding protein, E. coli
  'P42212', // green fluorescent protein
  'P00720', // T4 lysozyme
  'P0AA25', // thioredoxin, E. coli
  'P08515', // glutathione S-transferase, S. japonicum
  'Q12306', // SUMO (Smt3), yeast
  'P22629', // streptavidin
])

// One region per partner, spanning the residues that touch it, ranked by how
// many do. `residues` keeps the exact positions, since an interface is patchy —
// p53's DNA contacts are 30 residues spread over 180 — and the span alone would
// read as one solid block.
export function parseInterfaceRegions(
  json: unknown,
  uniprotId: string,
): ProteinRegion[] {
  const summary = (json as Record<string, InterfaceSummary> | null)?.[uniprotId]
  const regions: ProteinRegion[] = []
  for (const partner of summary?.data ?? []) {
    const accession = partner.accession ?? ''
    if (
      NOT_A_PARTNER.has(accession) ||
      NOT_A_PARTNER.has(partner.name ?? '') ||
      FUSION_TAGS.has(accession)
    ) {
      continue
    }
    const residues = new Set<number>()
    const entries = new Map<string, number>()
    for (const r of partner.residues ?? []) {
      if (r.startIndex === undefined) {
        continue
      }
      for (let p = r.startIndex; p <= (r.endIndex ?? r.startIndex); p++) {
        residues.add(p)
      }
      for (const id of r.allPDBEntries ?? []) {
        entries.set(id, (entries.get(id) ?? 0) + 1)
      }
    }
    if (residues.size === 0) {
      continue
    }
    const sorted = [...residues].sort((a, b) => a - b)
    const self = accession === uniprotId
    regions.push({
      kind: 'interface',
      name: self ? 'itself (homo-oligomer)' : (partner.name ?? accession),
      start: sorted[0]!,
      end: sorted.at(-1)!,
      accession,
      residues: sorted,
      pdbIds: [...entries]
        .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
        .slice(0, MAX_PDB_PER_PARTNER)
        .map(([id]) => id),
    })
  }
  return regions
    .sort((a, b) => b.residues!.length - a.residues!.length)
    .slice(0, MAX_PARTNERS)
}

// Every interface PDBe-KB has seen the protein at. A protein with no structure
// in a complex is a 404 here, which is "no partners", not an error.
export async function fetchInterfaceRegions(
  uniprotId: string,
): Promise<ProteinRegion[]> {
  const res = await fetch(
    `${PDBE_GRAPH}/uniprot/interface_residues/${encodeURIComponent(uniprotId)}`,
    { headers: { Accept: 'application/json' } },
  )
  if (res.status === 404) {
    return []
  }
  if (!res.ok) {
    throw new Error(`PDBe ${res.status} for ${uniprotId}`)
  }
  return parseInterfaceRegions(await res.json(), uniprotId)
}

// --- geometry ----------------------------------------------------------------

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
    .sort((a, b) => a.end - a.start - (b.end - b.start))[0]
}

// Whether two regions are the same one, for a toggle.
export function sameRegion(a: ProteinRegion, b: ProteinRegion) {
  return (
    a.kind === b.kind &&
    a.accession === b.accession &&
    a.start === b.start &&
    a.end === b.end
  )
}

// --- focus -------------------------------------------------------------------

// What the session opens on: a region of the map, or one residue the reader
// named (a hotspot, a variant). Both are on the canonical sequence.
export type Focus =
  | { kind: 'region'; region: ProteinRegion }
  | { kind: 'residue'; position: number; label?: string }

// The residues a focus names. An interface is its contact runs, as the map
// draws them: TP53's homo-oligomer contacts span 17–356 end to end.
export function focusRanges(focus: Focus): ResidueRange[] {
  if (focus.kind === 'residue') {
    return [{ start: focus.position, end: focus.position }]
  }
  const { start, end, residues } = focus.region
  return residues?.length ? residueRuns(residues) : [{ start, end }]
}

// How long a stretch two isoforms must share letter for letter before its
// residues carry over. Measured 2026-09-25 against codon identity on the
// genome, over the isoforms of TP53, PKM, CDKN2A, FGFR2, TPM1, BRAF and EGFR
// (51,550 shared residues): every residue two isoforms truly share sat in a
// stretch of 12 or more, while the paralogous mutually exclusive exons of PKM
// (9 and 10) and FGFR2 (IIIb and IIIc) share stretches of 8.
const SHARED_STRETCH = 10

// Each residue of `from` that `translation` shares, by 0-based index. A global
// alignment, because a local one dropped the far end of an EGFR isoform, and
// only residues inside a shared stretch: an alignment also pairs a mutually
// exclusive exon, or ARF's reading frame with p16's, residue for residue.
function sharedResidues(from: string, translation: string) {
  const { alignedSeq1: a, alignedSeq2: b } = needlemanWunsch(from, translation)
  const shared = new Map<number, number>()
  const stretch: [number, number][] = []
  let i = 0
  let j = 0
  for (let col = 0; col <= a.length; col++) {
    if (col < a.length && a[col] !== '-' && a[col] === b[col]) {
      stretch.push([i, j])
    } else {
      if (stretch.length >= SHARED_STRETCH) {
        for (const [x, y] of stretch) {
          shared.set(x, y)
        }
      }
      stretch.length = 0
    }
    if (a[col] !== undefined && a[col] !== '-') {
      i++
    }
    if (b[col] !== undefined && b[col] !== '-') {
      j++
    }
  }
  return shared
}

// Ranges on one isoform carried onto another's translation, split wherever the
// translation lacks residues and dropped where it lacks them all. Undefined
// for a pair too long to align.
export function translationRanges(
  ranges: readonly ResidueRange[],
  from: string,
  translation: string,
) {
  if (from === translation) {
    return ranges
  }
  if (alignmentTooLarge(translation.length, from.length)) {
    return undefined
  }
  const onTranslation = sharedResidues(from, translation)
  const runs: ResidueRange[] = []
  for (const { start, end } of ranges) {
    for (let residue = start; residue <= end; residue++) {
      const index = onTranslation.get(residue - 1)
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
// or the narrowest domain a focused residue sits in. An interface is a patch on
// whatever domains it crosses, not a family, so it offers none.
export function focusFamily(
  focus: Focus | undefined,
  regions: ProteinRegion[],
) {
  if (!focus) {
    return undefined
  }
  const region =
    focus.kind === 'region'
      ? focus.region.kind === 'interface'
        ? undefined
        : focus.region
      : regionContaining(regions, focus.position)
  return region?.pfam ? region : undefined
}

// Which of a chip's presets the map can honour yet: a residue at once, a
// family once InterPro has answered, a partner once PDBe has.
export function focusFromPreset(
  preset: ExampleFocus | undefined,
  regions: ProteinRegion[] | undefined,
  partners: ProteinRegion[] | undefined,
): Focus | undefined {
  if (preset?.residue) {
    return {
      kind: 'residue',
      position: preset.residue,
      label: preset.residueLabel,
    }
  }
  const region = preset?.pfam
    ? (regions?.find(r => r.pfam === preset.pfam && r.start === preset.start) ??
      regions?.find(r => r.pfam === preset.pfam))
    : preset?.partner
      ? partners?.find(r => r.accession === preset.partner)
      : undefined
  return region ? { kind: 'region', region } : undefined
}

// A focus in the shape a chip or a link names one, for the url. A cartoon
// domain or a site has no such name and is not carried.
export function presetOf(focus: Focus | undefined): ExampleFocus | undefined {
  if (!focus) {
    return undefined
  }
  if (focus.kind === 'residue') {
    return { residue: focus.position, residueLabel: focus.label }
  }
  const { region } = focus
  return region.kind === 'interface' && region.accession
    ? { partner: region.accession }
    : region.pfam
      ? { pfam: region.pfam, start: region.start }
      : undefined
}
