// Where a GenArk accession's hub sits, with no imports, so a page's client
// island reads it without the rest of hubtools.

/**
 * Splits a GenArk accession (e.g. GCF_000001405.40) into the path components
 * UCSC uses for hubs: { base: 'GCF', b1, b2, b3 } where b1/b2/b3 are 3-char
 * chunks of the digit portion. Returns undefined for malformed input.
 */
export function accessionChunks(accession: string) {
  const [base, rest] = accession.split('_')
  const matches = rest?.match(/.{1,3}/g)
  if (!base || !matches || matches.length < 3) {
    return undefined
  }
  const [b1, b2, b3] = matches as [string, string, string]
  return { base, b1, b2, b3 }
}

/** `GCF/000/001/405/GCF_000001405.40`, the hub's directory under hubs/. */
export function hubPath(accession: string) {
  const chunks = accessionChunks(accession)
  if (!chunks) {
    return undefined
  }
  const { base, b1, b2, b3 } = chunks
  return `${base}/${b1}/${b2}/${b3}/${accession}`
}
