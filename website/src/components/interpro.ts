// InterPro's view of one protein (entry/all/protein/uniprot/<acc>): every
// member-database match on the canonical sequence, integrated into InterPro
// entries. The domain vocabulary the field shares, and the Pfam accession under
// each domain is what has a curated seed alignment (pfamSeed.ts). TP53 answers
// in 13 KB, NOTCH1's 56 entries in two pages (2026-09-11).

import { withDeadline } from '../lib/fetchJson.ts'

import type { ProteinRegion, RegionKind } from './proteinRegions.ts'

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

// The InterPro entry types the map draws. A family or homologous superfamily
// spans the protein and says nothing about where to look, and a site is a few
// residues the map has no lane for.
const REGION_TYPES: Record<string, RegionKind> = {
  domain: 'domain',
  repeat: 'repeat',
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

type Span = ReturnType<typeof fragments>[number]

interface PfamMember {
  accession: string
  matches: Span[]
}

function overlap(a: Span, b: Span) {
  return Math.max(0, Math.min(a.end, b.end) - Math.max(a.start, b.start) + 1)
}

// An entry can integrate several Pfam families, each matching its own part of
// the entry, so a fragment takes the family whose matches cover most of it.
function memberAt(members: PfamMember[], fragment: Span) {
  const covered = (m: PfamMember) =>
    m.matches.reduce((n, f) => n + overlap(f, fragment), 0)
  return members.reduce<PfamMember | undefined>(
    (best, m) => (!best || covered(m) > covered(best) ? m : best),
    undefined,
  )
}

// One region per fragment of every InterPro entry that is a region, carrying
// the Pfam accession of the member entry integrated into it. A Pfam entry
// InterPro has not integrated is a region in its own right, since it still has
// a seed alignment; every other member database's unintegrated matches are
// left out — they are the signal InterPro's curators have not yet accepted.
// InterPro's entry spans every member's match, so `pfamSpan` keeps the Pfam
// match's own residues, which are all a seed row covers: HBB's Globin entry is
// 3–147, its PF00042 match 27–142.
export function parseInterProRegions(pages: InterProPage[]): ProteinRegion[] {
  const results = pages.flatMap(p => p.results ?? [])
  const pfamByEntry = new Map<string, PfamMember[]>()
  for (const r of results) {
    const m = r.metadata
    if (m?.source_database === 'pfam' && m.integrated && m.accession) {
      pfamByEntry.set(m.integrated, [
        ...(pfamByEntry.get(m.integrated) ?? []),
        { accession: m.accession, matches: fragments(r) },
      ])
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
    for (const fragment of fragments(r)) {
      const { start, end } = fragment
      const member = interpro
        ? memberAt(pfamByEntry.get(m.accession) ?? [], fragment)
        : undefined
      const pfam = interpro ? member?.accession : m.accession
      const within = member?.matches.filter(f => overlap(f, fragment) > 0)
      regions.push({
        kind,
        name: m.name ?? m.accession,
        start,
        end,
        accession: m.accession,
        ...(pfam ? { pfam } : {}),
        ...(within?.length
          ? {
              pfamSpan: {
                start: Math.min(...within.map(f => f.start)),
                end: Math.max(...within.map(f => f.end)),
              },
            }
          : {}),
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
// name it (NOTCH1's EGF repeats carry both PF00008 and PF07645).
function collapseRedundant(regions: ProteinRegion[]) {
  const kept: ProteinRegion[] = []
  for (const r of [...regions].sort((a, b) => +!!b.pfam - +!!a.pfam)) {
    if (r.pfam || !kept.some(k => samePlace(k, r))) {
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
    const res = await fetch(url, {
      headers: { Accept: 'application/json' },
      signal: withDeadline(),
    })
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
