// Re-export utilities from hubtools for backward compatibility
export { readJSON, readJSONAsync, requireArg, writeJSON } from 'hubtools'

import { accessionChunks } from 'hubtools'

export function getHubBasePath(accession: string): string {
  const chunks = accessionChunks(accession)
  if (!chunks) {
    throw new Error(`Unexpected accession format: ${accession}`)
  }
  const { base, b1, b2, b3 } = chunks
  return `hubs/${base}/${b1}/${b2}/${b3}/${accession}`
}

async function getWikipediaMainImage(
  pageTitle: string,
  lang = 'en',
): Promise<{ imageUrl: string; pageUrl: string } | undefined> {
  const apiUrl = `https://${lang}.wikipedia.org/w/api.php`
  const params = {
    action: 'query',
    titles: pageTitle,
    prop: 'pageimages',
    pithumbsize: '500',
    format: 'json',
    redirects: '1',
  }
  const url = `${apiUrl}?${new URLSearchParams(params).toString()}`
  const response = await fetch(url)
  if (!response.ok) {
    return undefined
  }
  const data = await response.json()
  const pages = data.query?.pages
  if (!pages) {
    return undefined
  }
  const pageId = Object.keys(pages)[0]!
  const page = pages[pageId]
  if (pageId === '-1' || !page.thumbnail) {
    return undefined
  }
  return {
    imageUrl: page.thumbnail.source,
    pageUrl: `https://wikipedia.org/wiki/${pageTitle}`,
  }
}

export async function fetchWikipediaImage(
  scientificName: string,
): Promise<{ imageUrl: string; pageUrl: string } | undefined> {
  // Applied twice: removing one suffix can expose another (e.g. "sp. ATCC 123" → "sp." → "")
  const processed = processSpeciesName(processSpeciesName(scientificName))
  const result = await getWikipediaMainImage(processed)
  if (result) {
    return result
  }
  // Fallback: deduplicate trailing word (e.g. "Homo Homo" -> "Homo")
  const words = processed.split(' ')
  if (words.length > 2 && words[words.length - 1] === words[words.length - 2]) {
    return getWikipediaMainImage(words.slice(0, -1).join(' '))
  }
  return undefined
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
