// InterPro's view of one protein (entry/all/protein/uniprot/<acc>): every
// member-database match on the canonical sequence, integrated into InterPro
// entries. The domain vocabulary the field shares, and the Pfam accession under
// each domain is what has a curated seed alignment (pfamSeed.ts). TP53 answers
// in 13 KB, NOTCH1's 56 entries in two pages (2026-09-11).

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
