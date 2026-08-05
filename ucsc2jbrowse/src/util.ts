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
import { readJSON } from 'hubtools'

import type { JBrowseConfig } from './types'

export function readConfig(configPath: string): JBrowseConfig {
  return readJSON<JBrowseConfig>(configPath)
}
