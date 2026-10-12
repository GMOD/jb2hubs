// PDBe-KB's graph API on one protein: every residue seen touching another
// molecule in any PDB entry, grouped by partner (interface_residues), and every
// residue seen touching a small molecule, grouped by ligand (ligand_sites) and
// here again into binding sites. Both name the entries that show it, which is
// what the session opens as a complex rather than a monomer. Half a megabyte
// each for TP53 or HBB, 9.5 KB for zebrafish tp53, 22 MB for Spike, so they
// are read when asked for, or unasked only under EAGER_PDB_ENTRIES.

import { fetchJsonOr404 } from '../lib/fetchJson.ts'

import type { ProteinRegion, SiteLigand } from './proteinRegions.ts'

const PDBE_GRAPH = 'https://www.ebi.ac.uk/pdbe/graph-api'

interface ContactRows {
  startIndex?: number
  endIndex?: number
  allPDBEntries?: string[]
}

// The residues a partner or ligand touches, and how many of its rows each PDB
// entry appears in.
function collectContacts(rows: ContactRows[] | undefined) {
  const residues = new Set<number>()
  const entries = new Map<string, number>()
  for (const r of rows ?? []) {
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
  return { residues, entries }
}

// The entries touching most of the residues, first.
function rankedEntries(entries: Map<string, number>) {
  return [...entries]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, MAX_PDB_PER_PARTNER)
    .map(([id]) => id)
}

interface InterfacePartner {
  name?: string
  accession?: string
  residues?: ContactRows[]
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
    const { residues, entries } = collectContacts(partner.residues)
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
      pdbIds: rankedEntries(entries),
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
  const json = await fetchJsonOr404(
    `${PDBE_GRAPH}/uniprot/interface_residues/${encodeURIComponent(uniprotId)}`,
    'PDBe',
    uniprotId,
  )
  return json ? parseInterfaceRegions(json, uniprotId) : []
}

// --- PDBe-KB ligand sites ------------------------------------------------------

interface LigandEntry {
  name?: string
  accession?: string
  residues?: ContactRows[]
  additionalData?: { isSolvent?: boolean }
}

// What crystallises a protein rather than what binds it. PDBe flags some as
// solvent (glycerol, ethylene glycol, sulfate); these it does not, and TP53's
// and EGFR's lists carry most of them (2026-10-09).
const ADDITIVES = new Set(
  (
    'GOL EDO PEG PGE PG4 1PE P6G 2PE 12P 15P PE3 PE4 PE5 PE8 P33 7PE XPE ' +
    'SO4 PO4 ACT ACY FMT FOR SIN CL BR CD ' +
    'IOD NA K NH4 NO3 SCN AZI CO3 MES EPE TRS BTB B3P CAC ARS SB DTT BME TLA ' +
    'MLI CIT FLC DMS IMD O4B MPD MRD HEZ IPA EOH MOH NHE'
  ).split(' '),
)

// A ligand touching fewer residues is a contact through a neighbouring chain
// or a crystal neighbour, not a site on this protein.
const MIN_LIGAND_RESIDUES = 3
const MAX_LIGAND_SITES = 6

// Two ligands share a site when most of the smaller one's residues are the
// other's: TP53's Y220C pocket holds forty-odd compounds, each crystallised
// once, and is one place on the protein, not forty lanes.
const SITE_OVERLAP = 0.5

function overlap(a: Set<number>, b: Set<number>) {
  let shared = 0
  for (const p of a) {
    if (b.has(p)) {
      shared++
    }
  }
  return shared / Math.min(a.size, b.size)
}

// The binding sites a protein has been seen with ligands at, best-attested
// first: ligands grouped by the residues they touch, each site named by its
// most-observed ligand's component id (`ZN`, `EXQ +41`), with the PDB entries
// touching most of its residues.
export function parseLigandSites(
  json: unknown,
  uniprotId: string,
): ProteinRegion[] {
  const summary = (json as Record<string, { data?: LigandEntry[] }> | null)?.[
    uniprotId
  ]
  const ligands = (summary?.data ?? []).flatMap(l => {
    const id = l.accession ?? ''
    if (!id || l.additionalData?.isSolvent || ADDITIVES.has(id)) {
      return []
    }
    const { residues, entries } = collectContacts(l.residues)
    return residues.size >= MIN_LIGAND_RESIDUES
      ? [{ id, name: l.name ?? id, residues, entries }]
      : []
  })
  ligands.sort((a, b) => b.entries.size - a.entries.size)
  const sites: {
    residues: Set<number>
    entries: Map<string, number>
    ligands: SiteLigand[]
  }[] = []
  for (const l of ligands) {
    const ligand = {
      id: l.id,
      name: l.name,
      residues: [...l.residues].sort((a, b) => a - b),
    }
    const site = sites.find(
      s => overlap(s.residues, l.residues) >= SITE_OVERLAP,
    )
    if (site) {
      l.residues.forEach(p => site.residues.add(p))
      l.entries.forEach((n, e) =>
        site.entries.set(e, (site.entries.get(e) ?? 0) + n),
      )
      site.ligands.push(ligand)
    } else {
      sites.push({
        residues: new Set(l.residues),
        entries: new Map(l.entries),
        ligands: [ligand],
      })
    }
  }
  return sites
    .sort((a, b) => b.entries.size - a.entries.size)
    .slice(0, MAX_LIGAND_SITES)
    .map(s => {
      const residues = [...s.residues].sort((a, b) => a - b)
      const [first] = s.ligands
      return {
        kind: 'ligand' as const,
        name:
          s.ligands.length > 1
            ? `${first!.id} +${s.ligands.length - 1}`
            : first!.id,
        start: residues[0]!,
        end: residues.at(-1)!,
        accession: first!.id,
        residues,
        ligands: s.ligands,
        pdbIds: rankedEntries(s.entries),
      }
    })
}

// Every ligand PDBe-KB has seen the protein bind, read when the reader asks:
// TP53's list is 413 KB. A protein with none is a 404, which is no sites.
// How many PDB entries hold the protein, from a 100-byte summary. The partner
// and ligand lists grow with it: about half a megabyte each at TP53's 321 and
// HBB's 350, but 22 MB and 51 s for SARS-CoV-2 Spike's 2,268 (2026-10-11).
export async function fetchPdbEntryCount(uniprotId: string) {
  const json = await fetchJsonOr404<Record<string, { pdbs?: number }>>(
    `${PDBE_GRAPH}/uniprot/summary_stats/${encodeURIComponent(uniprotId)}`,
    'PDBe',
    uniprotId,
  )
  return json?.[uniprotId]?.pdbs ?? 0
}

// The most PDB entries whose lists a focused residue reads unasked.
export const EAGER_PDB_ENTRIES = 1000

export async function fetchLigandSites(
  uniprotId: string,
): Promise<ProteinRegion[]> {
  const json = await fetchJsonOr404(
    `${PDBE_GRAPH}/uniprot/ligand_sites/${encodeURIComponent(uniprotId)}`,
    'PDBe',
    uniprotId,
  )
  return json ? parseLigandSites(json, uniprotId) : []
}
