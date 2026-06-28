// All NCBI E-utilities / Datasets calls go through here so they respect NCBI's
// rate limit (~3 req/s without a key, ~10 with one) instead of bursting and
// getting 429'd. Requests are serialized with a minimum gap and retried with
// backoff on 429/5xx. An NCBI_API_KEY (env, server-side) raises the limit and is
// appended to the query string.
//
// This throttle is the reason the assembler runs server-side once and caches:
// per-user browsers can't share a rate budget, but one serverless filler can.

export const EUTILS = 'https://eutils.ncbi.nlm.nih.gov/entrez/eutils'
export const DATASETS = 'https://api.ncbi.nlm.nih.gov/datasets/v2'

const API_KEY =
  typeof process !== 'undefined' ? process.env?.NCBI_API_KEY : undefined
const MIN_GAP_MS = API_KEY ? 110 : 350
const MAX_RETRIES = 4

function delay(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

let chain: Promise<unknown> = Promise.resolve()
let lastStart = 0

function withKey(url: string) {
  return API_KEY
    ? `${url}${url.includes('?') ? '&' : '?'}api_key=${API_KEY}`
    : url
}

async function fetchOnce(url: string, init?: RequestInit) {
  const gap = MIN_GAP_MS - (Date.now() - lastStart)
  if (gap > 0) {
    await delay(gap)
  }
  lastStart = Date.now()
  return fetch(withKey(url), init)
}

export async function ncbiFetch(
  url: string,
  init?: RequestInit,
): Promise<Response> {
  // Serialize through a single chain so concurrent callers still space out.
  const run = async () => {
    let attempt = 0
    let res = await fetchOnce(url, init)
    while ((res.status === 429 || res.status >= 500) && attempt < MAX_RETRIES) {
      attempt += 1
      await delay(MIN_GAP_MS * 2 ** attempt)
      res = await fetchOnce(url, init)
    }
    return res
  }
  const result = chain.then(run, run)
  chain = result.then(
    () => undefined,
    () => undefined,
  )
  return result
}

// Throttled fetch + JSON parse with a uniform error. The single place callers
// need for an NCBI GET-and-parse.
export async function ncbiJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await ncbiFetch(url, init)
  if (!res.ok) {
    throw new Error(`NCBI request failed (${res.status})`)
  }
  return res.json() as Promise<T>
}
