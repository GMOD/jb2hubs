import type { IndexEntry } from '../hooks/useSearchIndex.ts'

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

export function scoreEntry(entry: IndexEntry, terms: string[]) {
  const accession = entry[0].toLowerCase()
  const commonName = entry[1].toLowerCase()
  const scientificName = entry[2].toLowerCase()
  const assemblyName = entry[3].toLowerCase()
  const all = `${accession} ${commonName} ${scientificName} ${assemblyName}`

  if (!terms.every(term => all.includes(term))) {
    return -1
  }

  // Score based on best match position per term, using max (not sum)
  // across fields to avoid rewarding incidental matches in multiple fields
  let score = 0
  for (const term of terms) {
    const best = Math.max(
      scoreTerm(term, commonName) * 4,
      scoreTerm(term, scientificName) * 3,
      scoreTerm(term, accession) * 2,
      scoreTerm(term, assemblyName),
    )
    score += best
  }
  // Tiebreaker: prefer shorter commonName (closer match to query)
  // e.g. "human (...)" beats "human papillomavirus type 85 (...)"
  // Extract the name part before any parenthetical
  const nameBeforeParen = commonName.split('(')[0]!.trim()
  score += 1 / (1 + nameBeforeParen.length)

  // Tiebreaker: prefer Reference genomes
  if (entry[7] & 1) {
    score += 0.1
  }

  // Tiebreaker: prefer UCSC canonical browsers (hg38, mm39, etc.)
  if (entry[5] === 'ucsc') {
    score += 0.05
  }

  // Tiebreaker: prefer Chromosome-level assemblies
  const status = entry[4].toLowerCase()
  if (status === 'chromosome') {
    score += 0.01
  } else if (status === 'complete genome') {
    score += 0.005
  }
  return score
}

export function entryHref(entry: IndexEntry) {
  return entry[5] === 'ucsc' ? `/ucsc/${entry[0]}` : `/accession/${entry[0]}`
}
