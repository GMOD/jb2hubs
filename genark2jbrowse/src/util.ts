// Re-export utilities from hubtools for backward compatibility
export { readJSON, readJSONAsync, requireArg, writeJSON } from 'hubtools'

export function getHubBasePath(accession: string): string {
  const [base, rest] = accession.split('_')
  const matches = rest?.match(/.{1,3}/g)
  if (!matches || matches.length < 3) {
    throw new Error(`Unexpected accession format: ${accession}`)
  }
  const [b1, b2, b3] = matches
  return `hubs/${base}/${b1}/${b2}/${b3}/${accession}`
}

export function processSpeciesName(speciesName: string): string {
  return speciesName
    .replace(/\s+=\s.*$/, '')
    .replace(/^Candidatus\s+/i, '')
    .replace(/\s+-\s.*$/, '')
    .replace(/\s+\d+\s*$/, '')
    .replace(/\s+(str\.|strain).*$/i, '')
    .replace(/\s+var\..*$/i, '')
    .replace(/\s+sp\..*$/i, '')
    .replace(/\s+bv\..*$/i, '')
    .replace(/\s+subsp\..*$/i, '')
    .replace(/\s+serovar.*$/i, '')
    .replace(/\s+biovar.*$/i, '')
    .replace(/\s+cf.*$/i, '')
    .replace(/\s+f\..*$/i, '')
    .replace(/\s+type.*$/i, '')
    .replace(/\s+ATCC.*$/i, '')
    .replace(/\s+GI\/.*$/i, '')
    .replace(/\s+HU\/.*$/i, '')
    .replace(/\s+\S*:.*$/, '')
    .replace(/\s+[A-Z0-9\-.]+$/, '')
    .trim()
}
