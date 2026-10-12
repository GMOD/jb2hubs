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
//  - PDBe-KB graph API (uniprot/ligand_sites/<acc>): every residue seen
//    touching a small molecule, grouped by ligand, which this file groups again
//    into binding sites: the zinc a domain folds around, a drug's pocket.
//
// Both sets of coordinates are on the UniProt canonical sequence, 1-based
// inclusive. The launched transcript may translate to another isoform, and
// where it does `translationRanges` carries a focus across by alignment.
//
// Measured 2026-09-11: InterPro answers TP53 in 13 KB (22 entries, 2 pages at
// page_size 50 for NOTCH1's 56); the interface list is 496 KB for TP53 and
// 504 KB for HBB — well-studied extremes, 9.5 KB for zebrafish tp53 — so it is
// fetched only when the reader opens the partner list.

import { alignmentTooLarge, sharedIsoformResidues } from 'p2s_mapper'

import type { ExampleFocus } from './geneExamples.ts'
import type { ResidueRange } from './proteinSession.ts'

export type RegionKind =
  | 'domain'
  | 'repeat'
  | 'site'
  | 'interface'
  | 'ligand'
  | 'residue'

export interface SiteLigand {
  id: string
  name: string
  residues: number[]
}

export interface ProteinRegion {
  kind: RegionKind
  name: string
  // 1-based inclusive residues on the UniProt canonical sequence
  start: number
  end: number
  // InterPro accession for a domain/site; the partner's accession for an
  // interface (or `DNA`/`RNA`); the PDB chemical component id of a ligand
  // site's best-attested ligand
  accession?: string
  // the Pfam family under this entry, which is what has a seed alignment
  pfam?: string
  // interface and ligand only: which residues actually touch the partner or
  // the ligand, and which PDB entries hold them, most-covering first
  residues?: number[]
  pdbIds?: string[]
  // ligand only: every ligand seen at the site, best-attested first, with the
  // residues it touches, a site pooling ligands that touch different ones
  ligands?: SiteLigand[]
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
  return collapseRedundant(regions).sort(
    (a, b) => a.start - b.start || b.end - a.end,
  )
}

// How much of the longer of two domains the shorter has to cover for them to
// be one place on the protein.
const SAME_PLACE = 0.8

const domainLike = (r: ProteinRegion) =>
  r.kind === 'domain' || r.kind === 'repeat'

function samePlace(a: ProteinRegion, b: ProteinRegion) {
  const shared = Math.min(a.end, b.end) - Math.max(a.start, b.start) + 1
  return (
    shared / Math.max(a.end - a.start + 1, b.end - b.start + 1) >= SAME_PLACE
  )
}

// InterPro integrates several databases' views of one domain into separate
// entries, so EGFR's kinase took three lanes: Protein kinase domain,
// Tyrosine-protein kinase catalytic domain, and the Pfam one. A domain or
// repeat with no Pfam family goes where another covers the same residues;
// every Pfam one stays, since a focus opens its seed and a chip or link may
// name it (NOTCH1's EGF repeats carry both PF00008 and PF07645). Sites are
// left alone.
export function collapseRedundant(regions: ProteinRegion[]) {
  const kept: ProteinRegion[] = []
  for (const r of [...regions].sort((a, b) => +!!b.pfam - +!!a.pfam)) {
    if (
      !domainLike(r) ||
      !!r.pfam ||
      !kept.some(k => domainLike(k) && samePlace(k, r))
    ) {
      kept.push(r)
    }
  }
  return kept
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

// --- PDBe-KB ligand sites ------------------------------------------------------

interface LigandEntry {
  name?: string
  accession?: string
  residues?: {
    startIndex?: number
    endIndex?: number
    allPDBEntries?: string[]
  }[]
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
    const residues = new Set<number>()
    const entries = new Map<string, number>()
    for (const r of l.residues ?? []) {
      if (r.startIndex === undefined) {
        continue
      }
      for (let p = r.startIndex; p <= (r.endIndex ?? r.startIndex); p++) {
        residues.add(p)
      }
      for (const e of r.allPDBEntries ?? []) {
        entries.set(e, (entries.get(e) ?? 0) + 1)
      }
    }
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
        pdbIds: [...s.entries]
          .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
          .slice(0, MAX_PDB_PER_PARTNER)
          .map(([id]) => id),
      }
    })
}

// Every ligand PDBe-KB has seen the protein bind, read when the reader asks:
// TP53's list is 413 KB. A protein with none is a 404, which is no sites.
// How many PDB entries hold the protein, from a 100-byte summary. The partner
// and ligand lists grow with it: about half a megabyte each at TP53's 321 and
// HBB's 350, but 22 MB and 51 s for SARS-CoV-2 Spike's 2,268 (2026-10-11).
export async function fetchPdbEntryCount(uniprotId: string) {
  const res = await fetch(
    `${PDBE_GRAPH}/uniprot/summary_stats/${encodeURIComponent(uniprotId)}`,
    { headers: { Accept: 'application/json' } },
  )
  if (res.status === 404) {
    return 0
  }
  if (!res.ok) {
    throw new Error(`PDBe ${res.status} for ${uniprotId}`)
  }
  const json = (await res.json()) as Record<string, { pdbs?: number }>
  return json[uniprotId]?.pdbs ?? 0
}

// The most PDB entries whose lists a focused residue reads unasked.
export const EAGER_PDB_ENTRIES = 1000

export async function fetchLigandSites(
  uniprotId: string,
): Promise<ProteinRegion[]> {
  const res = await fetch(
    `${PDBE_GRAPH}/uniprot/ligand_sites/${encodeURIComponent(uniprotId)}`,
    { headers: { Accept: 'application/json' } },
  )
  if (res.status === 404) {
    return []
  }
  if (!res.ok) {
    throw new Error(`PDBe ${res.status} for ${uniprotId}`)
  }
  return parseLigandSites(await res.json(), uniprotId)
}

// --- what is known at a residue ----------------------------------------------

const PROTEINS_API = 'https://www.ebi.ac.uk/proteins/api'
const UNIPROT_REST = 'https://rest.uniprot.org/uniprotkb'

export type VariantClass =
  | 'pathogenic'
  | 'uncertain'
  | 'benign'
  | 'unclassified'

// UniProt's curator note on a substitution, with every alternate sharing it:
// TP53 R248Q and R248W are one note, "Li-Fraumeni syndrome; germline …".
export interface VariantNote {
  alts: string[]
  text: string
}

export interface ResidueVariants {
  position: number
  wildType?: string
  substitutions: { alt: string; class: VariantClass }[]
  // worst class first, then the most-cited
  notes: VariantNote[]
}

const CLASS_ORDER: VariantClass[] = [
  'pathogenic',
  'uncertain',
  'benign',
  'unclassified',
]

const CLASS_LABEL: Record<VariantClass, string> = {
  pathogenic: 'pathogenic',
  uncertain: 'uncertain significance',
  benign: 'benign',
  unclassified: 'no clinical class',
}

// Every record's ClinVar class for one substitution, read together, so records
// that disagree make it uncertain however the API splits them. `\b` keeps
// "Conflicting interpretations of pathogenicity" out of pathogenic.
function variantClass(significances: string[]): VariantClass {
  const has = (re: RegExp) => significances.some(t => re.test(t))
  const pathogenic = has(/pathogenic\b/i)
  const benign = has(/benign/i)
  return pathogenic && benign
    ? 'uncertain'
    : pathogenic
      ? 'pathogenic'
      : benign
        ? 'benign'
        : has(/uncertain|conflicting/i)
          ? 'uncertain'
          : 'unclassified'
}

interface ProteinsApiVariant {
  begin?: string
  end?: string
  wildType?: string
  alternativeSequence?: string
  consequenceType?: string
  clinicalSignificances?: { type: string }[]
  descriptions?: { value: string; sources?: string[] }[]
  evidences?: unknown[]
  association?: { name?: string }[]
}

const SUBSTITUTIONS = new Set(['missense', 'stop gained'])

// UniProt names a disease by acronym in a note ("SKCA; Hb S; …") and spells it
// out in the same records' associations ("Sickle cell disease (SKCA)"). Of
// several spellings the shortest reads best: "Colorectal cancer" over
// "Carcinoma of colon".
function diseaseAcronyms(features: ProteinsApiVariant[]) {
  const names = new Map<string, string>()
  for (const a of features.flatMap(f => f.association ?? [])) {
    const m = /^(.+) \(([A-Z][A-Z0-9-]+)\)$/.exec(a.name ?? '')
    const known = m && names.get(m[2]!)
    if (m && (!known || m[1]!.length < known.length)) {
      names.set(m[2]!, m[1]!)
    }
  }
  return names
}

const NOTE_LENGTH = 220

// The drug abbreviations UniProt's resistance notes use and spell out in the
// same or a sibling entry's comments (M. tuberculosis embB: "ethambutol [...
// EMB]"), from 1,010 resistance notes across 338 reviewed entries, 2026-10-11.
// Expanded only in a clause about resistance: outside one, PAS is periodic
// acid-Schiff and PI a pea germplasm accession.
const DRUG_ABBREVIATIONS: Record<string, string> = {
  EMB: 'ethambutol',
  PAS: 'para-aminosalicylic acid',
  GCV: 'ganciclovir',
  INH: 'isoniazid',
  ETH: 'ethionamide',
  PFA: 'foscarnet',
}

function spelledOut(clause: string, acronyms: Map<string, string>) {
  const disease = acronyms.get(clause)
  if (disease) {
    return disease
  }
  return /resist|suscep|sensitiv/i.test(clause)
    ? clause.replace(/\b[A-Z]{3}\b/g, abbr => DRUG_ABBREVIATIONS[abbr] ?? abbr)
    : clause
}

// A note is clauses: a disease acronym, the strains it was isolated from, then
// what the substitution does. The strain list goes and the acronym is spelled
// out. A list of other cancers it was "also found in" moves last, since BRAF
// V600E's would otherwise push "constitutive and elevated kinase activity" to
// the edge of the budget; clauses past the budget go, keeping the first.
function curatorNote(text: string, acronyms: Map<string, string>) {
  const kept = text
    .split(/;\s*/)
    .filter(c => c && !/\bstrains?\b/i.test(c))
    .map(c => spelledOut(c, acronyms))
  const elsewhere = (c: string) => /^also (found|seen|observed) in\b/i.test(c)
  const clauses = [
    ...kept.filter(c => !elsewhere(c)),
    ...kept.filter(elsewhere),
  ]
  let note = clauses[0] ?? ''
  for (const c of clauses.slice(1)) {
    if (note.length + c.length + 2 > NOTE_LENGTH) {
      return `${note}; …`
    }
    note = `${note}; ${c}`
  }
  return note
}

// The API answers a position query with the neighbouring positions too, so
// the filter on begin and end is needed.
export function parseResidueVariants(
  json: { features?: ProteinsApiVariant[] },
  position: number,
): ResidueVariants {
  const features = json.features ?? []
  const records = features.filter(
    f =>
      f.begin === String(position) &&
      f.end === String(position) &&
      SUBSTITUTIONS.has(f.consequenceType ?? '') &&
      f.alternativeSequence,
  )
  const acronyms = diseaseAcronyms(features)
  const byAlt = new Map<
    string,
    { significances: string[]; evidence: number; note?: string }
  >()
  for (const f of records) {
    const alt = f.alternativeSequence!
    const seen = byAlt.get(alt) ?? { significances: [], evidence: 0 }
    seen.significances.push(...(f.clinicalSignificances ?? []).map(c => c.type))
    seen.evidence += f.evidences?.length ?? 0
    const curated = f.descriptions?.find(d => d.sources?.includes('UniProt'))
    if (curated && !seen.note) {
      seen.note = curatorNote(curated.value, acronyms)
    }
    byAlt.set(alt, seen)
  }
  const rank = (c: VariantClass) => CLASS_ORDER.indexOf(c)
  const substitutions = [...byAlt]
    .map(([alt, s]) => ({ alt, class: variantClass(s.significances) }))
    .sort((a, b) => rank(a.class) - rank(b.class) || a.alt.localeCompare(b.alt))
  const notes = new Map<
    string,
    { alts: string[]; worst: number; evidence: number }
  >()
  for (const { alt, class: cls } of substitutions) {
    const { note, evidence } = byAlt.get(alt)!
    if (!note) {
      continue
    }
    const group = notes.get(note) ?? { alts: [], worst: rank(cls), evidence: 0 }
    group.alts.push(alt)
    group.evidence += evidence
    notes.set(note, group)
  }
  return {
    position,
    wildType: records[0]?.wildType,
    substitutions,
    notes: [...notes]
      .sort(([, a], [, b]) => a.worst - b.worst || b.evidence - a.evidence)
      .map(([text, { alts }]) => ({ alts, text })),
  }
}

// A whole gene's variants are 2-14 MB; one position is about a second. A
// protein UniProt holds no variation for is a 404.
export async function fetchResidueVariants(
  uniprotId: string,
  position: number,
): Promise<ResidueVariants | undefined> {
  const res = await fetch(
    `${PROTEINS_API}/variation/${encodeURIComponent(uniprotId)}?format=json&location=${position}`,
    { headers: { Accept: 'application/json' } },
  )
  if (res.status === 404) {
    return undefined
  }
  if (!res.ok) {
    throw new Error(`UniProt ${res.status} for ${uniprotId}`)
  }
  return parseResidueVariants(await res.json(), position)
}

const SHOWN_NOTES = 2

const altName = (alt: string) => (alt === '*' ? 'stop' : alt)

// The variants as lines: where, the best-attested curator notes, and the
// substitutions no shown note covers, by class.
export function residueVariantLines(v: ResidueVariants) {
  const at = `residue ${v.position}${v.wildType ? ` (${v.wildType})` : ''}`
  if (v.substitutions.length === 0) {
    return { at, notes: [] }
  }
  const notes = v.notes.slice(0, SHOWN_NOTES)
  const noted = new Set(notes.flatMap(n => n.alts))
  const parts = CLASS_ORDER.flatMap(cls => {
    const alts = v.substitutions
      .filter(s => s.class === cls && !noted.has(s.alt))
      .map(s => altName(s.alt))
    return alts.length ? [`${CLASS_LABEL[cls]} → ${alts.join(', ')}`] : []
  })
  return {
    at,
    notes: notes.map(n => `${n.alts.map(altName).join(', ')} — ${n.text}`),
    rest: parts.length
      ? `${notes.length ? 'Also ' : ''}${parts.join('; ')}.`
      : undefined,
  }
}

// Which species a partner is from, so a sentence can tell the protein's own
// partners from a pathogen's or a virus's: HBB's residue 7 touches S. aureus
// IsdH and IsdB, and neither haemoglobin chain.
export interface PartnerOrigin {
  species: string
  gene?: string
}

const NUCLEIC = new Set(['DNA', 'RNA'])

// The accessions whose species the sentence needs, or none when every partner
// is the protein itself or a nucleic acid.
// UniProt's accession format. PDBe files an antibody chain under a pseudo
// accession (`IG-heavy chain`), and one of those makes UniProt answer the
// whole accessions call with a 400.
const UNIPROT_ACCESSION =
  /^(?:[OPQ][0-9][A-Z0-9]{3}[0-9]|[A-NR-Z][0-9](?:[A-Z][A-Z0-9]{2}[0-9]){1,2})$/

// An antibody or antibody fragment, as PDBe names one: a crystallisation
// chaperone, a therapeutic or a patient's, never the protein's own partner.
export function isAntibody(r: ProteinRegion) {
  return (
    /^IG[HKL]?[- ]/.test(r.accession ?? '') ||
    (/^IG[HKL]? |immunoglobulin|\bfab\b|antibod|nanobod|\bfv\b|\b(heavy|light) chain\b|\bigg\b/i.test(
      r.name,
    ) &&
      !/binding protein/i.test(r.name))
  )
}

export function partnerAccessions(
  uniprotId: string,
  partners: ProteinRegion[],
) {
  const others = partners
    .filter(r => !isAntibody(r))
    .map(r => r.accession ?? '')
    .filter(a => a !== uniprotId && UNIPROT_ACCESSION.test(a))
  return others.length ? [uniprotId, ...new Set(others)] : []
}

interface UniProtOriginResult {
  primaryAccession?: string
  organism?: { scientificName?: string }
  genes?: { geneName?: { value?: string } }[]
}

// "Staphylococcus aureus (strain MW2)" and "(strain NCTC 8325 / PS 47)" are
// one species to a reader.
export function parseOrigins(json: { results?: UniProtOriginResult[] }) {
  const origins = new Map<string, PartnerOrigin>()
  for (const r of json.results ?? []) {
    const species = r.organism?.scientificName?.replace(/\s*\(.*\)$/, '')
    if (r.primaryAccession && species) {
      origins.set(r.primaryAccession, {
        species,
        gene: r.genes?.[0]?.geneName?.value,
      })
    }
  }
  return origins
}

export async function fetchOrigins(accessions: string[]) {
  const res = await fetch(
    `${UNIPROT_REST}/accessions?accessions=${accessions.map(encodeURIComponent).join(',')}&fields=accession,organism_name,gene_primary&format=json`,
    { headers: { Accept: 'application/json' } },
  )
  if (!res.ok) {
    throw new Error(`UniProt ${res.status} for partner species`)
  }
  return parseOrigins(await res.json())
}

const SHOWN_CONTACTS = 3
const SHOWN_SPECIES = 2

const RCSB_GRAPHQL = 'https://data.rcsb.org/graphql'

// A ligand a reader knows by name. PDBe's names are the chemical component
// dictionary's: RIFAMPICIN and SORANGICIN A read as words, a systematic name
// with locants and brackets does not, and the commonest cofactors read best
// as what biologists call them.
const LIGAND_NAMES: Record<string, string> = {
  HEM: 'haem',
  HEC: 'haem',
  HEA: 'haem',
  NAG: 'a glycan',
  ZN: 'zinc',
  MG: 'magnesium',
  CA: 'calcium',
  FE: 'iron',
  FE2: 'iron',
  MN: 'manganese',
  // Methylene quinuclidinone (MQ) after its Michael addition to a cysteine,
  // which RCSB names only as 2-methylquinuclidin-3-one. MQ is what PRIMA-1
  // and APR-246 (eprenetapopt) convert to, and it reactivates mutant p53 by
  // binding the core domain's cysteines (Zhang et al. 2018, Cell Death Dis
  // 9:439, doi:10.1038/s41419-018-0463-7). All eleven PDB entries holding
  // QNN or QN8 are p53 core domains from Degtjarik et al. 2021, Nat Commun
  // 12:7057, doi:10.1038/s41467-021-27142-6.
  QNN: 'methylene quinuclidinone (APR-246’s active form)',
  QN8: 'methylene quinuclidinone (APR-246’s active form)',
}
function readable(name: string) {
  return /^[A-Za-z][A-Za-z -]{2,24}$/.test(name)
    ? name
        .split(' ')
        .map(w =>
          w.length > 1 && !/^[IVX]+$/.test(w) && !/[a-z][A-Z]/.test(w)
            ? w.toLowerCase()
            : w,
        )
        .join(' ')
    : undefined
}

export function ligandName({ id, name }: { id: string; name: string }) {
  return LIGAND_NAMES[id] ?? readable(name)
}

const LOOKED_UP_LIGANDS = 10

// The ligands touching a residue that PDBe names only systematically, best
// attested first. A drug often has its common name among the component's
// synonyms: ERG11 Tyr132's 1YN is itraconazole.
export function unnamedLigands(position: number, sites: ProteinRegion[]) {
  return [
    ...new Set(
      sites.flatMap(s =>
        (s.ligands ?? [])
          .filter(l => l.residues.includes(position) && !ligandName(l))
          .map(l => l.id),
      ),
    ),
  ].slice(0, LOOKED_UP_LIGANDS)
}

interface RcsbChemComps {
  data?: {
    chem_comps?: ({
      chem_comp?: { id?: string }
      rcsb_chem_comp_synonyms?: { name?: string }[] | null
    } | null)[]
  }
}

// The first synonym that reads as a word, per component; one with none stays
// unnamed unless LIGAND_NAMES knows it, as it knows TP53 Arg248's QNN.
export function parseLigandSynonyms(json: RcsbChemComps) {
  const names = new Map<string, string>()
  for (const c of json.data?.chem_comps ?? []) {
    const id = c?.chem_comp?.id
    const name = (c?.rcsb_chem_comp_synonyms ?? [])
      .map(syn => readable(syn.name ?? ''))
      .find(Boolean)
    if (id && name) {
      names.set(id, name)
    }
  }
  return names
}

// RCSB's GraphQL answers a GET, so one request names every ligand without a
// CORS preflight, about 0.1 s.
export async function fetchLigandSynonyms(ids: string[]) {
  const query = `{chem_comps(comp_ids:${JSON.stringify(ids)}){chem_comp{id} rcsb_chem_comp_synonyms{name}}}`
  const res = await fetch(
    `${RCSB_GRAPHQL}?query=${encodeURIComponent(query)}`,
    { headers: { Accept: 'application/json' } },
  )
  if (!res.ok) {
    throw new Error(`RCSB ${res.status} for ligand names`)
  }
  return parseLigandSynonyms(await res.json())
}

// The landmarks every protein kinase domain carries, found by their motifs:
// the glycine-rich loop (GxGxxG) over the ATP, the catalytic loop (HRD, YRD in
// the AGC kinases), and the activation segment from DFG to APE (Nolen, Taylor
// & Ghosh 2004), whose conformation switches the kinase on. EGFR, ERBB2 and
// MET end theirs in ALE and ALK and BTK in PPE; RET's AIE and CK2's missing
// one are left unnamed rather than guessed. Checked 2026-10-11 against
// UniProt's own kinase domains for 29 kinases: BRAF DFG594–APE621, KIT
// DFG810–APE837, ABL1 DFG381–APE407, PKA YRD165, DFG185, APE207.
const KINASE_DOMAIN =
  /protein kinase|tyrosine-protein kinase|serine\/threonine-protein kinase/i

export interface KinaseLandmark {
  name: string
  start: number
  end: number
}

export function kinaseLandmarks(
  sequence: string,
  start: number,
  end: number,
): KinaseLandmark[] {
  const domain = sequence.slice(start - 1, end)
  const at = (offset: number) => start + offset
  const landmarks: KinaseLandmark[] = []
  const gly = /G.G..G/.exec(domain.slice(0, 40))
  if (gly) {
    landmarks.push({
      name: 'glycine-rich loop, which closes over the ATP',
      start: at(gly.index),
      end: at(gly.index + 5),
    })
  }
  const motif = (re: RegExp, from: number, to: number) => {
    const m = re.exec(domain.slice(from, to))
    return m ? from + m.index : undefined
  }
  for (const hrd of domain.matchAll(/[HY][RYCLFNG]D/g)) {
    const from = hrd.index + 3
    const dfg = motif(/D[FLYW]G/, from, from + 30)
    if (dfg === undefined) {
      continue
    }
    landmarks.push({
      name: `catalytic loop (${hrd[0]})`,
      start: at(hrd.index),
      end: at(hrd.index + 7),
    })
    const ape = motif(/[ASPV][PL]E/, dfg + 15, dfg + 45)
    if (ape !== undefined) {
      const triplet = (i: number) => domain.slice(i, i + 3)
      landmarks.push({
        name: `activation segment (${triplet(dfg)}${at(dfg)}–${triplet(ape)}${at(ape)}), which switches the kinase on`,
        start: at(dfg),
        end: at(ape + 2),
      })
    }
    break
  }
  return landmarks
}

function listed(names: string[], shown: number) {
  const head = names.slice(0, shown)
  const more = names.length - head.length
  const items = more > 0 ? [...head, `${more} more`] : head
  return items.length > 1
    ? `${items.slice(0, -1).join(', ')} and ${items.at(-1)}`
    : (items[0] ?? '')
}

// Where a residue sits: its domain, which of the protein's own partners PDBe-KB
// has seen it touch (or that it touches none of them), what other species'
// proteins touch it, and which ligands it binds. DNA and RNA lead, then the
// protein itself, since those are the contacts a reader can place. Sites whose
// ligands have no readable name are counted. Without `origins` every partner
// counts as the protein's own.
export function residueContextText(
  position: number,
  uniprotId: string,
  domains: ProteinRegion[],
  known: {
    partners?: ProteinRegion[]
    ligands?: ProteinRegion[]
    origins?: Map<string, PartnerOrigin>
    ligandSynonyms?: Map<string, string>
    sequence?: string
    curated?: CuratedSpan[]
  } = {},
): string {
  const { partners, ligands, origins, ligandSynonyms, sequence, curated } =
    known
  const touches = (r: ProteinRegion) => !!r.residues?.includes(position)
  const ownSpecies = origins?.get(uniprotId)?.species
  const foreignSpecies = (r: ProteinRegion) => {
    const species = origins?.get(r.accession ?? '')?.species
    return ownSpecies && species && species !== ownSpecies ? species : undefined
  }
  const rank = (r: ProteinRegion) =>
    NUCLEIC.has(r.accession ?? '') ? 0 : r.accession === uniprotId ? 1 : 2
  const proteins = (partners ?? []).filter(r => !isAntibody(r))
  const epitope = (partners ?? []).some(r => isAntibody(r) && touches(r))
  const own = proteins
    .filter(r => !foreignSpecies(r))
    .sort((a, b) => rank(a) - rank(b))
  const ownNames = (regions: ProteinRegion[]) => [
    ...new Set(regions.map(r => r.name)),
  ]
  const ownTouching = ownNames(own.filter(touches))

  const bySpecies = new Map<string, Set<string>>()
  for (const r of proteins.filter(touches)) {
    const species = foreignSpecies(r)
    if (species) {
      const name = origins?.get(r.accession ?? '')?.gene ?? r.name
      bySpecies.set(species, (bySpecies.get(species) ?? new Set()).add(name))
    }
  }
  const foreign = listed(
    [...bySpecies].map(
      ([species, names]) => `${species} ${listed([...names], SHOWN_CONTACTS)}`,
    ),
    SHOWN_SPECIES,
  )

  const domain = regionContaining(domains, position)
  const { chain, region } = curatedSpansAt(
    position,
    curated ?? [],
    sequence?.length ?? Math.max(0, ...(curated ?? []).map(s => s.end)),
  )
  const kinase = domains.find(
    r =>
      r.kind === 'domain' &&
      KINASE_DOMAIN.test(r.name) &&
      r.start <= position &&
      position <= r.end,
  )
  const landmark =
    kinase && sequence
      ? kinaseLandmarks(sequence, kinase.start, kinase.end).find(
          l => l.start <= position && position <= l.end,
        )
      : undefined
  const sites = (ligands ?? []).filter(touches)
  const bound = [
    ...new Set(
      sites.flatMap(s =>
        (s.ligands ?? []).flatMap(l =>
          l.residues.includes(position)
            ? (ligandName(l) ?? ligandSynonyms?.get(l.id) ?? [])
            : [],
        ),
      ),
    ),
  ]
  const clauses = [
    domain &&
      `lies in the ${domain.kind} “${domain.name}”${landmark ? `, in its ${landmark.name}` : ''}`,
    chain && `is in ${chain.name} (${chain.start}–${chain.end})`,
    region &&
      `is in UniProt's “${region.name}” (${region.start}–${region.end})`,
    ownTouching.length > 0
      ? `contacts ${listed(ownTouching, SHOWN_CONTACTS)}`
      : own.length > 0 &&
        `is outside the protein's interfaces with ${listed(ownNames(own), SHOWN_CONTACTS)}`,
    foreign &&
      (ownTouching.length > 0
        ? `also touches ${foreign}`
        : own.length > 0
          ? `touches only ${foreign}`
          : `touches ${foreign}`),
    epitope && 'is in an antibody epitope',
    bound.length > 0
      ? `binds ${listed(bound, SHOWN_CONTACTS)}`
      : sites.length > 0 &&
        `is in ${sites.length} ligand site${sites.length > 1 ? 's' : ''}`,
  ].filter(Boolean)
  return clauses.length ? `Residue ${position} ${clauses.join('; ')}.` : ''
}

// What UniProt's curators mark on the protein besides domains: the chains a
// precursor is cut into (SARS-CoV-2 Spike's S1 and S2) and named regions and
// motifs ("Receptor-binding motif; binding to human ACE2", "Interaction with
// the 53BP2 SH3 domain"). About 5 KB for TP53.
export interface CuratedSpan {
  kind: 'chain' | 'region'
  name: string
  start: number
  end: number
}

interface UniProtFeature {
  type?: string
  description?: string
  location?: { start?: { value?: number }; end?: { value?: number } }
}

export function parseCuratedSpans(json: { features?: UniProtFeature[] }) {
  return (json.features ?? []).flatMap((f): CuratedSpan[] => {
    const start = f.location?.start?.value
    const end = f.location?.end?.value
    const name = f.description ?? ''
    if (!start || !end || !name || name === 'Disordered') {
      return []
    }
    const kind =
      f.type === 'Chain'
        ? 'chain'
        : f.type === 'Region' || f.type === 'Motif'
          ? 'region'
          : undefined
    return kind ? [{ kind, name, start, end }] : []
  })
}

export async function fetchCuratedSpans(uniprotId: string) {
  const res = await fetch(
    `${UNIPROT_REST}/${encodeURIComponent(uniprotId)}.json?fields=ft_chain,ft_region,ft_motif`,
    { headers: { Accept: 'application/json' } },
  )
  if (!res.ok) {
    throw new Error(`UniProt ${res.status} for ${uniprotId}`)
  }
  return parseCuratedSpans(await res.json())
}

// A region wider than this is a mapping of where a partner binds, often a
// third of the protein (TP53's "Interaction with CCAR2" is 1–320), and says
// little about one residue.
const MAX_REGION_SPAN = 100

// The chain a residue is in, when the protein is cut into several and this
// one is not most of it, and the narrowest curated region holding it.
export function curatedSpansAt(
  position: number,
  spans: CuratedSpan[],
  length: number,
) {
  const holding = spans.filter(s => s.start <= position && position <= s.end)
  const chains = spans.filter(s => s.kind === 'chain')
  const chain =
    chains.length > 1
      ? holding.find(
          s => s.kind === 'chain' && s.end - s.start + 1 < 0.9 * length,
        )
      : undefined
  const region = holding
    .filter(s => s.kind === 'region' && s.end - s.start < MAX_REGION_SPAN)
    .sort((a, b) => a.end - a.start - (b.end - b.start))[0]
  return { chain, region }
}

// --- conservation at a residue ------------------------------------------------

const PDBE_API = 'https://www.ebi.ac.uk/pdbe/api/v2'

// PDBe-KB's profile of the protein's homologues at one residue, from 3DPatch's
// profile HMM (Jakubec, Vondrášek & Finn 2018): each amino acid's emission
// probability at the column, which reads as its share among homologues.
export interface ResidueConservation {
  profile: { aa: string; p: number }[]
}

export function parseConservation(json: {
  data?: Record<string, number[] | undefined>
}): ResidueConservation {
  const profile = Object.entries(json.data ?? {})
    .filter(([k]) => k.startsWith('probability_'))
    .map(([k, v]) => ({ aa: k.slice('probability_'.length), p: v?.[0] ?? 0 }))
    .sort((a, b) => b.p - a.p)
  return { profile }
}

// Under 1 KB and half a second. A protein PDBe-KB has no profile for is a 404.
export async function fetchConservation(uniprotId: string, position: number) {
  const res = await fetch(
    `${PDBE_API}/uniprot/sequence_conservation/${encodeURIComponent(uniprotId)}/${position}`,
    { headers: { Accept: 'application/json' } },
  )
  if (res.status === 404) {
    return undefined
  }
  if (!res.ok) {
    throw new Error(`PDBe ${res.status} for ${uniprotId}`)
  }
  return parseConservation(await res.json())
}

// A column whose likeliest residue is under this share is near-uniform: the
// profile has too few homologues there to say anything (Spike 614's top is S
// at 12%).
const MIN_PROFILE_SIGNAL = 0.15
const SHOWN_RESIDUES = 3

// "Conserved across homologues: R 62%, K 9%, Q 4%." The residue's own amino
// acid is added when it is not among the likeliest.
export function conservationText(
  wildType: string | undefined,
  c: ResidueConservation,
) {
  const top = c.profile[0]
  if (!top || top.p < MIN_PROFILE_SIGNAL) {
    return ''
  }
  const pct = (p: number) => `${Math.round(p * 100)}%`
  const shown = c.profile.slice(0, SHOWN_RESIDUES)
  const own = c.profile.find(r => r.aa === wildType)
  const listed = [...shown, ...(own && !shown.includes(own) ? [own] : [])].map(
    r => `${r.aa} ${pct(r.p)}`,
  )
  const share = own?.p ?? 0
  const verdict =
    share >= 0.5
      ? 'Conserved across homologues'
      : share < 0.2
        ? 'Variable across homologues'
        : 'Across homologues'
  return `${verdict}: ${listed.join(', ')}.`
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
function sameRegion(a: ProteinRegion, b: ProteinRegion) {
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
  if (from === translation) {
    return ranges
  }
  if (alignmentTooLarge(translation.length, from.length)) {
    return undefined
  }
  const onTranslation = sharedIsoformResidues(from, translation)
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

// What the ruler's flag calls a residue: the variant or residue its label
// names (E6V, R248, S450L), else its number.
export function residueFlag(focus: { position: number; label?: string }) {
  return (
    /\b[A-Z]\d+[A-Z*]?(?!\w)/.exec(focus.label ?? '')?.[0] ??
    String(focus.position)
  )
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
// or the narrowest domain a focused residue sits in. An interface or a ligand
// site is a patch on whatever domains it crosses, not a family, so it offers
// none.
export function focusFamily(
  focus: Focus | undefined,
  regions: ProteinRegion[],
) {
  if (!focus) {
    return undefined
  }
  const region =
    focus.kind === 'region'
      ? focus.region.kind === 'interface' || focus.region.kind === 'ligand'
        ? undefined
        : focus.region
      : regionContaining(regions, focus.position)
  return region?.pfam ? region : undefined
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
    : region.kind === 'ligand' && region.accession
      ? { ligand: region.accession }
      : region.pfam
        ? { pfam: region.pfam, start: region.start }
        : undefined
}
