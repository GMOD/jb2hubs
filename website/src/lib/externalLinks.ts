// Outbound links to the two upstreams this site points at, in one place.
//
// UCSC and NCBI both reshuffle their URL space periodically — NCBI's assembly
// pages moved from /assembly/<acc> to /datasets/genome/<acc>, and its taxonomy
// pages from /Taxonomy/Browser/wwwtax.cgi to /datasets/taxonomy/<id> — and each
// of these shapes was spelled out at two or three call sites spread across .tsx
// and .astro. That is two or three places to find on the next move, in files
// only one of which is typechecked.
//
// The launch URLs for our own hosted JBrowse configs are NOT here: they live in
// config/jbrowse.ts, because which build they target is a staging decision.

export function ucscBrowserUrl(db: string) {
  return `https://genome.ucsc.edu/cgi-bin/hgTracks?db=${db}`
}

export function ucscGatewayUrl(db: string) {
  return `https://genome.ucsc.edu/cgi-bin/hgGateway?db=${db}`
}

// UCSC's short redirect for a GenArk assembly, which lands on whichever browser
// they currently serve that accession from.
export function ucscGenArkUrl(accession: string) {
  return `https://genome.ucsc.edu/h/${accession}`
}

export function ncbiGenomeUrl(accession: string) {
  return `https://www.ncbi.nlm.nih.gov/datasets/genome/${accession}/`
}

export function ncbiTaxonomyUrl(taxonId: string | number) {
  return `https://www.ncbi.nlm.nih.gov/datasets/taxonomy/${taxonId}/`
}

export function ncbiGeneUrl(geneId: string) {
  return `https://www.ncbi.nlm.nih.gov/gene/${geneId}`
}

export function ncbiBioProjectUrl(accession: string) {
  return `https://www.ncbi.nlm.nih.gov/bioproject/${accession}`
}
