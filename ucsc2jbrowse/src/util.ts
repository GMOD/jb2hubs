// Re-export utilities from hubtools
export {
  decodeURIComponentNoThrow,
  readJSON,
  readJSONAsync,
  replaceLink,
  requireArg,
  splitOnFirst,
  writeJSON,
} from 'hubtools'
import fs from 'fs'

import type { JBrowseConfig } from './types'

export function readConfig(configPath: string): JBrowseConfig {
  return JSON.parse(fs.readFileSync(configPath, 'utf8'))
}
