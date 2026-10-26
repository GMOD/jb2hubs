import fs from 'fs'

export function isRecord(x: unknown): x is Record<string, unknown> {
  return typeof x === 'object' && x !== null
}

export function isErrnoCode(error: unknown, code: string) {
  return error instanceof Error && 'code' in error && error.code === code
}

export function resolve(uri: string, baseUri: string | URL) {
  return new URL(uri, baseUri).href
}

// hgdownload fails by stalling after the TLS Client Hello, and node's fetch has
// no deadline of its own. The files fetched here arrive in seconds, so only a
// stall reaches a minute.
export const FETCH_TIMEOUT_MS = 60_000

export class HttpError extends Error {
  // plain fields: --experimental-strip-types rejects parameter properties
  status: number
  url: string

  constructor(status: number, url: string) {
    super(`HTTP ${status} fetching ${url}`)
    this.name = 'HttpError'
    this.status = status
    this.url = url
  }
}

export function isGone(error: unknown): error is HttpError {
  return (
    error instanceof HttpError && (error.status === 404 || error.status === 410)
  )
}

// Whether asking again would only get the same answer: 408 and 429 are the
// 4xx that mean "ask again", and a 5xx is no answer at all.
export function isDefinitiveStatus(status: number) {
  return status < 500 && status !== 408 && status !== 429
}

function isDefinitive(error: unknown) {
  return error instanceof HttpError && isDefinitiveStatus(error.status)
}

export async function myfetch(url: string, timeoutMs = FETCH_TIMEOUT_MS) {
  const res = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) })
  if (!res.ok) {
    await res.body?.cancel()
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
    } catch (e) {
      if (!isErrnoCode(e, 'EXDEV')) {
        throw e
      }
      fs.copyFileSync(src, dest)
      fs.utimesSync(dest, s.atime, s.mtime)
    }
  }
}

// at most `limit` in flight, kept low against hgdownload's burst drops
export async function mapWithConcurrency<T>(
  items: T[],
  limit: number,
  fn: (item: T, index: number) => Promise<void>,
) {
  let next = 0
  async function worker() {
    while (next < items.length) {
      const i = next++
      await fn(items[i]!, i)
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, () => worker()),
  )
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
  let transientError: unknown
  for (let i = 0; i < attempts; i++) {
    if (i > 0) {
      await new Promise(r => setTimeout(r, 2000 * i))
    }
    // Only a round where EVERY host answered definitively ends the loop. A
    // retired hub costs two requests instead of six and none of the 6s of
    // backoff -- but a mirror 404 while the primary is unreachable is not
    // evidence the file is gone, so both have to agree before we stop asking.
    let answered = true
    transientError = undefined
    for (const candidate of urls) {
      try {
        return await myfetchtext(candidate)
      } catch (e) {
        lastError = e
        if (!isDefinitive(e)) {
          transientError = e
          answered = false
        }
      }
    }
    if (answered) {
      break
    }
  }
  throw transientError ?? lastError
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
        assembly: assemblyName,
        loc,
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

/** `GCF/000/001/405/GCF_000001405.40`, the hub's directory under hubs/. */
export function hubPath(accession: string) {
  const chunks = accessionChunks(accession)
  if (!chunks) {
    return undefined
  }
  const { base, b1, b2, b3 } = chunks
  return `${base}/${b1}/${b2}/${b3}/${accession}`
}
