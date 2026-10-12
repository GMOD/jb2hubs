import path from 'path'

// Re-export utilities from hubtools
export {
  readJSON,
  replaceLink,
  requireArg,
  splitOnFirst,
  writeJSON,
} from 'hubtools'
import { readJSON } from 'hubtools'

import type { JBrowseConfig } from './types'

/** ucsc2jbrowse/, where the hand-authored and cache directories live */
export const UCSC_ROOT = path.join(import.meta.dirname, '..')

export function readConfig(configPath: string): JBrowseConfig {
  return readJSON<JBrowseConfig>(configPath)
}
