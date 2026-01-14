// Re-export utilities from hubtools
export {
  readJSON,
  readJSONAsync,
  writeJSON,
  splitOnFirst,
  replaceLink,
  decodeURIComponentNoThrow,
  requireArg,
} from 'hubtools'

import type { JBrowseConfig } from './types'

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
