// How a PDB entry numbers the residues of a UniProt sequence. Author numbering
// is what a paper cites and what the protein3d plugin lights `initialResidues`
// by, and it is not the UniProt numbering for every entry: haemoglobin's
// chains number from the mature protein, so author residue 1 is UniProt
// residue 2 (2HHB, measured 2026-09-12). SIFTS records the mapping per chain
// segment, and PDBe serves it cross-origin.

import { fetchJson } from '../lib/fetchJson.ts'

const PDBE_API = 'https://www.ebi.ac.uk/pdbe/api'

export interface SiftsSegment {
  chain: string
  authorStart: number
  authorEnd: number
  unpStart: number
  unpEnd: number
}

interface SiftsMapping {
  chain_id?: string
  start?: { author_residue_number?: number | null }
  end?: { author_residue_number?: number | null }
  unp_start?: number
  unp_end?: number
}

type SiftsResponse = Record<
  string,
  { UniProt?: Record<string, { mappings?: SiftsMapping[] }> }
>

export function parseSiftsSegments(
  json: unknown,
  pdbId: string,
  uniprotId: string,
): SiftsSegment[] {
  const entry = (json as SiftsResponse | null)?.[pdbId.toLowerCase()]
  const mappings = entry?.UniProt?.[uniprotId]?.mappings ?? []
  return mappings.flatMap(m => {
    const authorStart = m.start?.author_residue_number
    const authorEnd = m.end?.author_residue_number
    return m.chain_id &&
      typeof authorStart === 'number' &&
      typeof authorEnd === 'number' &&
      m.unp_start !== undefined &&
      m.unp_end !== undefined
      ? [
          {
            chain: m.chain_id,
            authorStart,
            authorEnd,
            unpStart: m.unp_start,
            unpEnd: m.unp_end,
          },
        ]
      : []
  })
}

export async function fetchSiftsSegments(pdbId: string, uniprotId: string) {
  const json = await fetchJson<unknown>(
    `${PDBE_API}/mappings/uniprot/${encodeURIComponent(pdbId.toLowerCase())}`,
  )
  return parseSiftsSegments(json, pdbId, uniprotId)
}

export interface AuthorRange {
  start: number
  end: number
  chain: string
  // author number minus UniProt number in the chosen segment
  shift: number
}

// The author-numbered range a UniProt range is cited by in the entry: the
// segment overlapping most of the range decides the shift. Undefined when no
// chain of the entry covers any of it.
export function toAuthorRange(
  segments: SiftsSegment[],
  range: { start: number; end: number },
): AuthorRange | undefined {
  const overlap = (s: SiftsSegment) =>
    Math.min(s.unpEnd, range.end) - Math.max(s.unpStart, range.start) + 1
  const best = segments
    .filter(s => overlap(s) > 0)
    .sort((a, b) => overlap(b) - overlap(a))[0]
  if (!best) {
    return undefined
  }
  const shift = best.authorStart - best.unpStart
  return {
    start: Math.max(range.start, best.unpStart) + shift,
    end: Math.min(range.end, best.unpEnd) + shift,
    chain: best.chain,
    shift,
  }
}
