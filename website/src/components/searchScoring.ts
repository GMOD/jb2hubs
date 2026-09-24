import { IS_REFERENCE } from '../lib/searchIndex.ts'
import { bareCommonName, commonNameLabel } from '../utils/names.ts'

import type { IndexEntry } from '../lib/searchIndex.ts'

export function scoreTerm(term: string, field: string) {
  if (field.startsWith(term)) {
    return 3
  }
  if (field.includes(` ${term}`)) {
    return 2
  }
  if (field.includes(term)) {
    return 1
  }
  return 0
}

// The GenBank and RefSeq accessions of one genome differ only in their prefix,
// and a UCSC db records whichever one its sourceName happened to carry — hg38 is
// GCA_000001405.15 while the GenArk row for the same genome is GCF_000001405.40.
// Matching on the prefixless digits makes either query find both.
function withoutAccessionPrefix(text: string) {
  return text.replace(/gc[af]_/g, '')
}

// Newer assemblies first, over a window wide enough for every year in the index.
function recency(year: number) {
  return year ? Math.min(1, Math.max(0, (year - 1995) / 35)) : 0
}

// A bare `gcf_` strips to nothing, and an empty term is a substring of every
// row: typed alone it matched all 52,727. So it is not a term at all.
function usableTerms(terms: string[]) {
  return terms
    .map(term => term.trim())
    .filter(term => withoutAccessionPrefix(term) !== '')
}

// What scoring reads off an entry, lowercased and joined once per index rather
// than once per entry per keystroke. Measured 2026-09-24 over all 53,056
// entries under node: rebuilding them cost 28–63 ms a query, reading them
// prepared costs 1–3 ms, and preparing them is under 80 ms once. `bonus` is the
// tiebreakers, which depend on the entry alone.
interface Searchable {
  entry: IndexEntry
  // Without GenArk's parenthetical, which is scored with the assembly name
  commonName: string
  // Names the index borrowed for a UCSC db, matched like the common name
  aliases: string[]
  scientificName: string
  // Then the parenthetical, which in "human (GRCh38.p14 2022)" names the
  // assembly and its year. Scored as the common name, it outranked hg38's own
  // assembly field for "GRCh38", and put hs1 18th for "t2t", under rows such as
  // "Swan (goose T2T HZ-2024a 2024)".
  assemblyName: string
  accessionText: string
  // accessionText with a space at each end, so a whole token is a substring
  accessionTokens: string
  all: string
  bonus: number
}

const NO_ALIASES: string[] = []

function prepare(entry: IndexEntry): Searchable {
  const commonName = entry[1].toLowerCase()
  const aliases = entry[11]?.length
    ? entry[11].map(name => name.toLowerCase())
    : NO_ALIASES
  const scientificName = entry[2].toLowerCase()
  const assemblyName = entry[3].toLowerCase()
  const bare = bareCommonName(commonName)
  const label = commonNameLabel(commonName)
  const accessions = `${entry[0]} ${entry[10]}`.toLowerCase().trim()
  const accessionText = `${accessions} ${withoutAccessionPrefix(accessions)}`
  return {
    entry,
    commonName: bare,
    aliases,
    scientificName,
    assemblyName: label ? `${assemblyName} ${label}` : assemblyName,
    accessionText,
    accessionTokens: ` ${accessionText} `,
    all: `${accessionText} ${commonName} ${aliases.join(' ')} ${scientificName} ${assemblyName}`,
    bonus: tiebreak(entry, aliases[0] ? bareCommonName(aliases[0]) : bare),
  }
}

// Tiebreakers between equally-matching rows, each band an order of magnitude
// below the one above so a stronger signal always decides. They stay well
// under 1 so they never outrank a better textual match. A row with borrowed
// names is measured by the first of them, which is the name search matches it
// by: "A. gambiae" is short because it is abbreviated, and put anoGam3 above
// "African clawed frog" for "african".
function tiebreak(entry: IndexEntry, bareName: string) {
  // Prefer the least cluttered common name, so "human (GRCh38.p14 2022)" beats
  // "human papillomavirus type 85 (...)" for the query "human".
  let bonus = 0.5 / (1 + bareName.length)

  // Curation: the assembly someone deliberately designated as *the* one for this
  // species. UCSC building a full browser for a db and NCBI designating a
  // reference genome are the two such signals we have, and both must outweigh
  // recency — otherwise the 464 HPRC haplotypes (2024) bury hg38 and GRCh38.
  //
  // TWO BANDS, not one, because the two signals do not buy a user the same
  // thing: a UCSC db opens with that genome's whole track catalog, a GenArk
  // accession with whatever its hub carries. Flat at 0.03 each they tied, and
  // "human" then came down to recency — which put GCF_000001405.40 (GRCh38.p14,
  // an NCBI reference, 2022) above hg38 (2013) and hs1, i.e. the sparser browser
  // first. The gap here (0.03) is wider than recency can ever be (0.02), so a
  // UCSC db outranks a GenArk reference of the same genome at every pair of
  // years.
  if (entry[5] === 'ucsc') {
    bonus += 0.06
  }
  if (entry[7] & IS_REFERENCE) {
    bonus += 0.03
  }

  // Recency, which is what separates current assemblies from retired ones within
  // a species: mm39 (2020) over mm7 (2005), danRer11 (2017) over danRer3 (2005).
  bonus += 0.02 * recency(entry[8])

  // Prefer more complete assemblies. Note this band never fires for a UCSC db:
  // those rows carry an empty assemblyStatus, so it is a small standing bonus
  // for GenArk rows rather than a comparison between the two sources. It sits
  // an order of magnitude below recency, so nothing above it turns on this.
  const status = entry[4].toLowerCase()
  if (status === 'chromosome') {
    bonus += 0.002
  } else if (status === 'complete genome') {
    bonus += 0.001
  }

  // Last resort between same-year UCSC dbs: UCSC's own ordering for the species.
  if (entry[9]) {
    bonus += 0.0005 / entry[9]
  }
  return bonus
}

// A term as typed, and as it matches an accession with its GCA_/GCF_ dropped.
interface Term {
  text: string
  accession: string
}

function prepareTerms(rawTerms: string[]): Term[] {
  return usableTerms(rawTerms).map(text => ({
    text,
    accession: withoutAccessionPrefix(text),
  }))
}

function scoreNames(term: string, commonName: string, aliases: string[]) {
  let best = scoreTerm(term, commonName)
  for (const name of aliases) {
    best = Math.max(best, scoreTerm(term, name))
  }
  return best
}

function score(s: Searchable, terms: Term[]) {
  if (terms.length === 0 || !terms.every(t => s.all.includes(t.accession))) {
    return -1
  }
  // Score based on best match position per term, using max (not sum)
  // across fields to avoid rewarding incidental matches in multiple fields
  let total = 0
  for (const { text, accession } of terms) {
    total += Math.max(
      scoreNames(text, s.commonName, s.aliases) * 4,
      // Weighted equal to the common name: users type genus names ("Arabidopsis",
      // "Drosophila", "Danio") at least as often, and ranking the common name
      // higher put viruses named after a host above the host itself.
      scoreTerm(text, s.scientificName) * 4,
      // A whole accession outranks one it is a prefix of: GCA_000001405.1 is
      // hg19, and as a prefix match it tied hg38's GCA_000001405.15, which then
      // won on recency.
      s.accessionTokens.includes(` ${accession} `)
        ? 8
        : scoreTerm(accession, s.accessionText) * 2,
      scoreTerm(text, s.assemblyName),
    )
  }
  return total + s.bonus
}

export function scoreEntry(entry: IndexEntry, rawTerms: string[]) {
  return score(prepare(entry), prepareTerms(rawTerms))
}

const prepared = new WeakMap<IndexEntry[], Searchable[]>()

function searchable(index: IndexEntry[]) {
  let rows = prepared.get(index)
  if (!rows) {
    rows = index.map(prepare)
    prepared.set(index, rows)
  }
  return rows
}

// Best-first ranking over the whole index, shared by the search page and the
// header typeahead so both order results the same way. `include` narrows the
// candidates before scoring (the page's clade / reference-only filters). The
// index is prepared on its first ranking and reused for every later one.
export function rankEntries(
  index: IndexEntry[],
  terms: string[],
  include?: (entry: IndexEntry) => boolean,
) {
  const query = prepareTerms(terms)
  const scored: { entry: IndexEntry; score: number }[] = []
  if (query.length > 0) {
    for (const s of searchable(index)) {
      if (!include || include(s.entry)) {
        const value = score(s, query)
        if (value >= 0) {
          scored.push({ entry: s.entry, score: value })
        }
      }
    }
  }
  scored.sort((a, b) => b.score - a.score)
  return scored.map(s => s.entry)
}

// Someone deliberately designated this assembly as *the* one for its species —
// either UCSC built a browser for it or NCBI marked it a reference genome. Also
// drives the "Reference assemblies only" filter, which is how a user cuts the
// alternate haplotypes and GenBank/RefSeq duplicates out of a big result set.
export function isCurated(entry: IndexEntry) {
  return entry[5] === 'ucsc' || !!(entry[7] & IS_REFERENCE)
}

export function entryHref(entry: IndexEntry) {
  return entry[5] === 'ucsc' ? `/ucsc/${entry[0]}` : `/accession/${entry[0]}`
}
