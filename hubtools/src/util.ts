import fs from 'fs'
import { readFile } from 'fs/promises'

export function resolve(uri: string, baseUri: string | URL) {
  return new URL(uri, baseUri).href
}

export async function myfetch(url: string) {
  const res = await fetch(url)
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} fetching ${url}`)
  }
  return res
}
export async function myfetchtext(url: string) {
  const res = await myfetch(url)
  return res.text()
}

// eslint-disable-next-line @typescript-eslint/no-unnecessary-type-parameters
export function readJSON<T = unknown>(filePath: string): T {
  return JSON.parse(fs.readFileSync(filePath, 'utf8')) as T
}

export async function readJSONAsync<T = unknown>(filePath: string): Promise<T> {
  return JSON.parse(await readFile(filePath, 'utf8')) as T
}

export function writeJSON(filePath: string, data: unknown): void {
  fs.writeFileSync(filePath, JSON.stringify(data, undefined, 2))
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
