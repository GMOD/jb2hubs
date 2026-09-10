import fs from 'fs'
import { readFile } from 'fs/promises'

// The configs these scripts read are JSON of a shape nothing validates, so the
// nested reads all start from `unknown`.
export function isRecord(x: unknown): x is Record<string, unknown> {
  return typeof x === 'object' && x !== null
}

export function resolve(uri: string, baseUri: string | URL) {
  return new URL(uri, baseUri).href
}

// hgdownload's documented failure mode is a STALL, not an error: the TCP
// handshake completes, the TLS Client Hello goes out, and no Server Hello ever
// comes back. node's fetch has no deadline of its own for that -- measured on
// node 24.2.0 against a socket that accepts the connection and never answers, a
// bare `fetch` was still hanging at 45 seconds -- so without this the retry
// loop in myfetchtextWithRetry never gets to retry and the hgdownload2 fallback
// beneath it is never asked, during exactly the outage both were written for.
// This is the same deadline website/src/lib/ucscLiveness.ts carries, for the
// same reason: a probe with no timeout hangs like the thing it is diagnosing.
//
// Every caller here reads a small text file -- hub.txt, genomes.txt,
// trackDb.txt, a GenArk category list -- and the largest of those is a few MB
// that arrives in about two seconds, so a minute is a deadline only a stall can
// reach.
//
// Exported because it is a policy, not a local constant: every fetch in either
// pipeline talks to hgdownload, api.genome.ucsc.edu, eutils or wikipedia, all
// of which can stall, and one number to change beats six. mirrorSidecars.ts and
// the ucsc/genark probes all read it.
export const FETCH_TIMEOUT_MS = 60_000

// A response that arrived and said no, as distinct from a request that never
// got an answer. That is the same 404-vs-transient split checkIfFileAccessible,
// mirrorSidecars and the GenArk GFF downloader each draw for themselves, and
// carrying the status on the error is what lets a caller draw it without
// re-parsing a message or spending a second request to ask again.
export class HttpError extends Error {
  // Plain fields, not parameter properties: everything here runs under node's
  // --experimental-strip-types, which rejects those outright.
  status: number
  url: string

  constructor(status: number, url: string) {
    super(`HTTP ${status} fetching ${url}`)
    this.name = 'HttpError'
    this.status = status
    this.url = url
  }
}

// Whether upstream has answered the question, so asking again would only get
// the same answer. 408 and 429 are the two 4xx that explicitly mean "ask
// again"; everything else in that range is a decision, and a 5xx or a thrown
// connection error is not an answer at all.
function isDefinitive(error: unknown) {
  return (
    error instanceof HttpError &&
    error.status >= 400 &&
    error.status < 500 &&
    error.status !== 408 &&
    error.status !== 429
  )
}

export async function myfetch(url: string, timeoutMs = FETCH_TIMEOUT_MS) {
  const res = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) })
  if (!res.ok) {
    throw new HttpError(res.status, url)
  }
  return res
}
export async function myfetchtext(url: string, timeoutMs = FETCH_TIMEOUT_MS) {
  const res = await myfetch(url, timeoutMs)
  return res.text()
}

export function readJSON<T = unknown>(filePath: string): T {
  return JSON.parse(fs.readFileSync(filePath, 'utf8')) as T
}

export async function readJSONAsync<T = unknown>(filePath: string): Promise<T> {
  return JSON.parse(await readFile(filePath, 'utf8')) as T
}

export function writeJSON(filePath: string, data: unknown): void {
  fs.writeFileSync(filePath, JSON.stringify(data, undefined, 2))
}

// Puts `src` at `dest` as a hard link, or a copy when they are on different
// devices. Already current when `dest` is the same inode, or a copy with the
// source's size and mtime (the copy is stamped with them), so a re-derived
// source is picked up without the file being copied on every run.
export function linkOrCopy(src: string, dest: string) {
  const s = fs.statSync(src)
  const d = fs.existsSync(dest) ? fs.statSync(dest) : undefined
  // Within a millisecond, because that is the precision the stamp survives at:
  // the filesystem keeps sub-millisecond mtimes, `s.mtime` is a Date that does
  // not, and utimes writes the difference back as a value that can land either
  // side of the whole millisecond (a source at ...650.68 is stamped onto the
  // copy as ...650.999 or ...651). Comparing floors called those unequal about
  // half the time, and re-copied a file that was already current.
  const same =
    d !== undefined &&
    (d.ino === s.ino ||
      (d.size === s.size && Math.abs(d.mtimeMs - s.mtimeMs) < 1))
  if (!same) {
    fs.rmSync(dest, { force: true })
    try {
      fs.linkSync(src, dest)
    } catch {
      fs.copyFileSync(src, dest)
      fs.utimesSync(dest, s.atime, s.mtime)
    }
  }
}

const HGDOWNLOAD = 'hgdownload.soe.ucsc.edu'
const HGDOWNLOAD_MIRROR = 'hgdownload2.soe.ucsc.edu'

// hgdownload2 serves the same tree from a different UCSC address block, so it
// answers while the primary is stalling or refusing connections outright. Only
// the text is read from it -- the caller keeps naming the primary in whatever
// it writes -- so a fallback cannot put the mirror in a published config.
function fetchHosts(url: string) {
  const mirror = new URL(url)
  if (mirror.hostname !== HGDOWNLOAD) {
    return [url]
  }
  mirror.hostname = HGDOWNLOAD_MIRROR
  return [url, mirror.href]
}

// hgdownload stalls and drops connections under load, so a one-off fetch of a
// small file is retried a few times, and each round asks the mirror too,
// before it counts as failed.
//
// The backoff sits BEFORE each retry, not after each round: sleeping after the
// last round spent 6s of the 12s deciding nothing, on the path a whole config
// build exits from when one hub.txt loses all three attempts.
export async function myfetchtextWithRetry(url: string, attempts = 3) {
  const urls = fetchHosts(url)
  let lastError: unknown
  for (let i = 0; i < attempts; i++) {
    if (i > 0) {
      await new Promise(r => setTimeout(r, 2000 * i))
    }
    // Only a round where EVERY host answered definitively ends the loop. A
    // retired hub costs two requests instead of six and none of the 6s of
    // backoff -- but a mirror 404 while the primary is unreachable is not
    // evidence the file is gone, so both have to agree before we stop asking.
    let answered = true
    for (const candidate of urls) {
      try {
        return await myfetchtext(candidate)
      } catch (e) {
        lastError = e
        answered = answered && isDefinitive(e)
      }
    }
    if (answered) {
      break
    }
  }
  throw lastError
}

// Builds the JBrowse defaultSession that opens a LinearGenomeView at the
// assembly's default position with the track selector widget active.
export function makeDefaultSession(assemblyName: string, loc: string) {
  return {
    name: assemblyName,
    widgets: {
      hierarchicalTrackSelector: {
        id: 'hierarchicalTrackSelector',
        type: 'HierarchicalTrackSelectorWidget',
        view: 'initialView',
      },
    },
    activeWidgets: {
      hierarchicalTrackSelector: 'hierarchicalTrackSelector',
    },
    views: [
      {
        type: 'LinearGenomeView',
        id: 'initialView',
        init: {
          assembly: assemblyName,
          loc,
        },
      },
    ],
  }
}

export function splitOnFirst(str: string, sep: string): [string, string] {
  const index = str.indexOf(sep)
  return index < 0
    ? ([str, ''] as const)
    : ([str.slice(0, index), str.slice(index + sep.length)] as const)
}

/**
 * Replaces specific relative links in a string with absolute UCSC genome links.
 * This is typically used for HTML content from UCSC track databases.
 * @param htmlContent The string containing HTML content.
 * @returns The string with replaced links.
 */
export function replaceLink(htmlContent: string): string {
  return htmlContent
    .replaceAll('\\', ' ') // Replace escaped backslashes with spaces
    .replaceAll('../../', 'https://genome.ucsc.edu/')
    .replaceAll('../', 'https://genome.ucsc.edu/')
    .replaceAll('"/cgi-bin', '"https://genome.ucsc.edu/cgi-bin')
}

/**
 * Decodes a URI component, gracefully handling malformed URIs.
 * @param uri The URI component to decode.
 * @returns The decoded URI component, or the original URI if decoding fails.
 */
export function decodeURIComponentNoThrow(uri: string): string {
  try {
    return decodeURIComponent(uri)
  } catch (_e) {
    return uri
  }
}

export function requireArg(arg: string | undefined, usage: string): string {
  if (!arg) {
    console.error(usage)
    process.exit(1)
  }
  return arg
}

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
