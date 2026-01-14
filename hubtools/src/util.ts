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
export async function myfetchjson(url: string) {
  const res = await myfetch(url)
  return res.json()
}

export function makeLoc(
  first: string,
  base: {
    uri: string
    baseUri?: string
  },
) {
  return {
    uri: new URL(first, new URL(base.uri, base.baseUri)).href,
    locationType: 'UriLocation',
  }
}

export function makeLocAlt(
  first: string,
  alt: string,
  base: {
    uri: string
  },
) {
  return first ? makeLoc(first, base) : makeLoc(alt, base)
}

export function makeLoc2(first: string, alt?: string) {
  return first
    ? {
        uri: first,
        locationType: 'LocalPath',
      }
    : {
        uri: alt,
        locationType: 'UriLocation',
      }
}

/**
 * Reads a JSON file synchronously and parses its content.
 * @param filePath The path to the JSON file.
 * @returns The parsed JSON object.
 */
// eslint-disable-next-line @typescript-eslint/no-unnecessary-type-parameters
export function readJSON<T = unknown>(filePath: string): T {
  return JSON.parse(fs.readFileSync(filePath, 'utf8')) as T
}

/**
 * Reads a JSON file asynchronously and parses its content.
 * @param filePath The path to the JSON file.
 * @returns A promise that resolves to the parsed JSON object.
 */
// eslint-disable-next-line @typescript-eslint/no-unnecessary-type-parameters
export async function readJSONAsync<T = unknown>(filePath: string): Promise<T> {
  return JSON.parse(await readFile(filePath, 'utf8')) as T
}

/**
 * Writes a JavaScript object to a JSON file.
 * @param filePath The path to the output JSON file.
 * @param data The data to write.
 */
export function writeJSON(filePath: string, data: unknown): void {
  fs.writeFileSync(filePath, JSON.stringify(data, undefined, 2))
}

export async function myjsonfetch(url: string) {
  const res = await fetch(url)
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} fetching ${url}`)
  }
  return res.json() as Promise<unknown>
}

/**
 * Splits a string on the first occurrence of a separator.
 * @param str The string to split.
 * @param sep The separator string.
 * @returns A tuple containing the part before the separator and the part after.
 *          If the separator is not found, the second element will be an empty string.
 */
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
    // Avoid throwing exception on a failure to decode URI component
    return uri
  }
}

/**
 * Validates that a required CLI argument is provided.
 * Exits with code 1 if the argument is missing.
 * @param arg The argument value to check.
 * @param usage The usage message to display if validation fails.
 * @returns The validated argument (non-null).
 */
export function requireArg(arg: string | undefined, usage: string): string {
  if (!arg) {
    console.error(usage)
    process.exit(1)
  }
  return arg
}
