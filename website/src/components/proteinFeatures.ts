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
// where it does the card says the range is approximate — see ProteinLaunchCard.
//
// Measured 2026-09-11: InterPro answers TP53 in 13 KB (22 entries, 2 pages at
// page_size 50 for NOTCH1's 56); the interface list is 496 KB for TP53 and
// 504 KB for HBB — well-studied extremes, 9.5 KB for zebrafish tp53 — so it is
// fetched only when the reader opens the partner list.

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

// Partners with no molecule behind them: PDBe files unassigned chains and
// expression tags under these.
const NOT_A_PARTNER = new Set(['Other', 'other', ''])

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
    if (NOT_A_PARTNER.has(accession) || NOT_A_PARTNER.has(partner.name ?? '')) {
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

export function focusRange(focus: Focus) {
  return focus.kind === 'region'
    ? { start: focus.region.start, end: focus.region.end }
    : { start: focus.position, end: focus.position }
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
