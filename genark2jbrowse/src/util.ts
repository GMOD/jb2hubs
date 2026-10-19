import { FETCH_TIMEOUT_MS, HttpError, hubPath } from 'hubtools'

export function getHubBasePath(accession: string): string {
  const path = hubPath(accession)
  if (!path) {
    throw new Error(`Unexpected accession format: ${accession}`)
  }
  return `hubs/${path}`
}

const WIKIPEDIA_API = 'https://en.wikipedia.org/w/api.php'
const WIKIPEDIA_USER_AGENT = 'jb2hubs/1.0 (https://jbrowse.org)'
const WIKIPEDIA_ATTEMPTS = 5
const WIKIPEDIA_MAX_WAIT_S = 60

export const WIKIPEDIA_BATCH_SIZE = 50

export interface WikipediaImage {
  imageUrl: string
  pageUrl: string
}

interface WikipediaQuery {
  normalized?: { from: string; to: string }[]
  redirects?: { from: string; to: string }[]
  pages?: Record<string, { title: string; thumbnail?: { source: string } }>
}

export function wikipediaImagesByTitle(
  query: WikipediaQuery | undefined,
  titles: string[],
) {
  const normalized = new Map(query?.normalized?.map(n => [n.from, n.to] as const))
  const redirected = new Map(query?.redirects?.map(r => [r.from, r.to] as const))
  const pages = new Map(
    Object.values(query?.pages ?? {}).map(page => [page.title, page] as const),
  )
  return new Map(
    titles.map((title): [string, WikipediaImage | undefined] => {
      const normal = normalized.get(title) ?? title
      const thumbnail = pages.get(redirected.get(normal) ?? normal)?.thumbnail
      return [
        title,
        thumbnail && {
          imageUrl: thumbnail.source,
          pageUrl: `https://wikipedia.org/wiki/${title}`,
        },
      ]
    }),
  )
}

async function fetchWikipediaBatch(titles: string[]) {
  const params = new URLSearchParams({
    action: 'query',
    titles: titles.join('|'),
    prop: 'pageimages',
    pithumbsize: '500',
    format: 'json',
    redirects: '1',
  })
  const url = `${WIKIPEDIA_API}?${params}`
  for (let attempt = 1; ; attempt++) {
    const response = await fetch(url, {
      headers: { 'User-Agent': WIKIPEDIA_USER_AGENT },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    })
    if (response.ok) {
      const data = (await response.json()) as { query?: WikipediaQuery }
      return wikipediaImagesByTitle(data.query, titles)
    }
    if (response.status !== 429 || attempt === WIKIPEDIA_ATTEMPTS) {
      throw new HttpError(response.status, url)
    }
    const retryAfter = Number(response.headers.get('retry-after'))
    const waitS = Math.min(retryAfter || 5 * attempt, WIKIPEDIA_MAX_WAIT_S)
    await new Promise(r => setTimeout(r, waitS * 1000))
  }
}

function dedupedTitle(title: string) {
  const words = title.split(' ')
  return words.length > 2 && words.at(-1) === words.at(-2)
    ? words.slice(0, -1).join(' ')
    : undefined
}

// One request per WIKIPEDIA_BATCH_SIZE names. The map holds an entry for every
// name, undefined when Wikipedia answered with no image; a request that fails
// throws, so the caller can tell "no image" from "no answer".
export async function fetchWikipediaImages(scientificNames: string[]) {
  const titleOf = new Map(
    scientificNames.map(
      name =>
        [
          name,
          processSpeciesName(processSpeciesName(name)).replaceAll('|', ' '),
        ] as const,
    ),
  )
  const byTitle = await fetchWikipediaBatch([...new Set(titleOf.values())])
  const retitled = new Map<string, string>()
  for (const [title, image] of byTitle) {
    const deduped = dedupedTitle(title)
    if (!image && deduped) {
      retitled.set(title, deduped)
    }
  }
  if (retitled.size > 0) {
    const second = await fetchWikipediaBatch([...new Set(retitled.values())])
    for (const [title, deduped] of retitled) {
      byTitle.set(title, second.get(deduped))
    }
  }
  return new Map(
    scientificNames.map((name): [string, WikipediaImage | undefined] => [
      name,
      byTitle.get(titleOf.get(name)!),
    ]),
  )
}

function processSpeciesName(speciesName: string): string {
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
