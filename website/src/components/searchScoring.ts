import { IS_REFERENCE } from '../lib/searchIndex.ts'
import { bareCommonName } from '../utils/names.ts'

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

export function scoreEntry(entry: IndexEntry, terms: string[]) {
  const commonName = entry[1].toLowerCase()
  const scientificName = entry[2].toLowerCase()
  const assemblyName = entry[3].toLowerCase()
  const accessions = `${entry[0]} ${entry[10]}`.toLowerCase().trim()
  const accessionText = `${accessions} ${withoutAccessionPrefix(accessions)}`
  const all = `${accessionText} ${commonName} ${scientificName} ${assemblyName}`

  if (!terms.every(term => all.includes(withoutAccessionPrefix(term.trim())))) {
    return -1
  }

  // Score based on best match position per term, using max (not sum)
  // across fields to avoid rewarding incidental matches in multiple fields
  let score = 0
  for (const term of terms) {
    const best = Math.max(
      scoreTerm(term, commonName) * 4,
      // Weighted equal to the common name: users type genus names ("Arabidopsis",
      // "Drosophila", "Danio") at least as often, and ranking the common name
      // higher put viruses named after a host above the host itself.
      scoreTerm(term, scientificName) * 4,
      scoreTerm(withoutAccessionPrefix(term), accessionText) * 2,
      scoreTerm(term, assemblyName),
    )
    score += best
  }

  // Tiebreakers between equally-matching rows, each band an order of magnitude
  // below the one above so a stronger signal always decides. They stay well
  // under 1 so they never outrank a better textual match.

  // Prefer the least cluttered common name, so "human (GRCh38.p14 2022)" beats
  // "human papillomavirus type 85 (...)" for the query "human".
  score += 0.5 / (1 + bareCommonName(commonName).length)

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
    score += 0.06
  }
  if (entry[7] & IS_REFERENCE) {
    score += 0.03
  }

  // Recency, which is what separates current assemblies from retired ones within
  // a species: mm39 (2020) over mm7 (2005), danRer11 (2017) over danRer3 (2005).
  score += 0.02 * recency(entry[8])

  // Prefer more complete assemblies. Note this band never fires for a UCSC db:
  // those rows carry an empty assemblyStatus, so it is a small standing bonus
  // for GenArk rows rather than a comparison between the two sources. It sits
  // an order of magnitude below recency, so nothing above it turns on this.
  const status = entry[4].toLowerCase()
  if (status === 'chromosome') {
    score += 0.002
  } else if (status === 'complete genome') {
    score += 0.001
  }

  // Last resort between same-year UCSC dbs: UCSC's own ordering for the species.
  if (entry[9]) {
    score += 0.0005 / entry[9]
  }

  return score
}

// Best-first ranking over the whole index, shared by the search page and the
// header typeahead so both order results the same way. `include` narrows the
// candidates before scoring (the page's clade / reference-only filters).
export function rankEntries(
  index: IndexEntry[],
  terms: string[],
  include?: (entry: IndexEntry) => boolean,
) {
  const scored: { entry: IndexEntry; score: number }[] = []
  for (const entry of index) {
    if (!include || include(entry)) {
      const score = scoreEntry(entry, terms)
      if (score >= 0) {
        scored.push({ entry, score })
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
