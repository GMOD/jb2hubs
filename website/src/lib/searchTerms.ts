// A query as every search box on the site reads it: lowercased and split on
// whitespace, each term required, so "mus brca" narrows rather than widens.
// The hub tables and the UCSC table used to match the whole query as one
// substring, so the same two words found rows on /search and nothing there.
export function searchTerms(query: string) {
  return query.toLowerCase().split(/\s+/).filter(Boolean)
}

export function matchesAllTerms(text: string, terms: string[]) {
  const haystack = text.toLowerCase()
  return terms.every(term => haystack.includes(term))
}
