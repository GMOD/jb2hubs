import fs from 'fs'

import type { JBrowseConfig } from './types'

/**
 * Reads a JSON file and parses its content.
 * @param filePath The path to the JSON file.
 * @returns The parsed JSON object.
 * @template T The expected type of the JSON object.
 */
// eslint-disable-next-line @typescript-eslint/no-unnecessary-type-parameters
export function readJSON<T>(filePath: string): T {
  return JSON.parse(fs.readFileSync(filePath, 'utf8')) as T
}

/**
 * Writes a JavaScript object to a JSON file.
 * @param filePath The path to the output JSON file.
 * @param data The data to write.
 */
export function writeJSON(filePath: string, data: unknown): void {
  fs.writeFileSync(filePath, JSON.stringify(data, undefined, 2))
}

/**
 * Splits a string on the first occurrence of a separator.
 * @param str The string to split.
 * @param sep The separator string.
 * @returns A tuple containing the part before the separator and the part after it.
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
 * Reads and parses a JBrowse configuration file.
 * @param configPath The path to the JBrowse configuration file.
 * @returns The parsed JBrowse configuration object.
 * @throws Error if the config file cannot be read or parsed.
 */
export function readConfig(configPath: string): JBrowseConfig {
  return readJSON<JBrowseConfig>(configPath)
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
