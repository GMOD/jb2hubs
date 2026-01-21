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
import fs from 'fs'

import type { JBrowseConfig } from './types'

/**
 * Reads and parses a JBrowse configuration file.
 * @param configPath The path to the JBrowse configuration file.
 * @returns The parsed JBrowse configuration object.
 * @throws Error if the config file cannot be read or parsed.
 */
export function readConfig(configPath: string): JBrowseConfig {
  return JSON.parse(fs.readFileSync(configPath, 'utf8'))
}
