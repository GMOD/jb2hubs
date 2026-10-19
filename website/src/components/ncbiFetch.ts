// Every NCBI E-utilities / Datasets call goes through here, so the page keeps
// to NCBI's rate limit (~3 req/s without a key, ~10 with one): requests run one
// at a time with a minimum gap, each attempt has a deadline, and a 429, a 5xx
// or a timed-out attempt is retried with backoff. An NCBI_API_KEY (env,
// server-side) raises the limit and goes on the query string.

import { delay } from '../lib/delay.ts'
import {
  FETCH_TIMEOUT_MS,
  HttpError,
  isTimeout,
  withDeadline,
} from '../lib/fetchJson.ts'

export const EUTILS = 'https://eutils.ncbi.nlm.nih.gov/entrez/eutils'
export const DATASETS = 'https://api.ncbi.nlm.nih.gov/datasets/v2'

const API_KEY =
  typeof process !== 'undefined' ? process.env.NCBI_API_KEY : undefined
const MIN_GAP_MS = API_KEY ? 110 : 350
const MAX_RETRIES = 4

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
    await delay(gap, init?.signal ?? undefined)
  }
  lastStart = Date.now()
  return fetch(withKey(url), { ...init, signal: withDeadline(init?.signal) })
    .then((res): Response | Error => res)
    .catch((e: unknown) => {
      if (!isTimeout(e)) {
        throw e
      }
      return e
    })
}

export async function ncbiFetch(
  url: string,
  init?: RequestInit,
): Promise<Response> {
  // Serialized through one chain so concurrent callers still space out. A
  // request whose signal fired while it waited in line gives its turn up.
  const run = async () => {
    init?.signal?.throwIfAborted()
    for (let attempt = 0; ; attempt++) {
      const res = await fetchOnce(url, init)
      const retryable =
        res instanceof Error || res.status === 429 || res.status >= 500
      if (!retryable) {
        return res
      }
      if (attempt === MAX_RETRIES) {
        if (res instanceof Error) {
          throw new Error(
            `NCBI did not answer within ${FETCH_TIMEOUT_MS / 1000} s`,
            { cause: res },
          )
        }
        return res
      }
      await delay(MIN_GAP_MS * 2 ** (attempt + 1), init?.signal ?? undefined)
    }
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
    throw new HttpError(`NCBI request failed (${res.status})`, res.status)
  }
  return res.json() as Promise<T>
}

// The NCBI Datasets orthologs endpoint (full report). Centralized so the URL and
// its params live in one place; each caller supplies the response shape it reads.
//
// `taxa` scopes the answer to those clades. The endpoint takes `taxon_filter`
// repeatedly and UNIONS the values, which is what lets one request ask for three
// sibling reptile clades; an empty list asks for every species. A filter naming
// a clade the gene has no ortholog in comes back as `{}` — no `reports`, no
// `total_count` — so callers must treat both as optional.
export function fetchOrthologReports<T>(
  geneId: string,
  taxa: number[] = [],
  signal?: AbortSignal,
): Promise<T> {
  const filters = taxa.map(t => `&taxon_filter=${t}`).join('')
  return ncbiJson<T>(
    `${DATASETS}/gene/id/${geneId}/orthologs?returned_content=COMPLETE${filters}`,
    { signal },
  )
}

// Throttled fetch returning text — for efetch flatfile/FASTA endpoints, which
// don't speak JSON.
export async function ncbiText(
  url: string,
  init?: RequestInit,
): Promise<string> {
  const res = await ncbiFetch(url, init)
  if (!res.ok) {
    throw new HttpError(`NCBI request failed (${res.status})`, res.status)
  }
  return res.text()
}
