import path from 'path'

// Re-export utilities from hubtools
export {
  readJSON,
  replaceLink,
  requireArg,
  splitOnFirst,
  writeJSON,
} from 'hubtools'
import { checked, readJSON } from 'hubtools'

import { isUcscConfig } from './guards.ts'

import type { Guard } from 'hubtools'

/** ucsc2jbrowse/, where the hand-authored and cache directories live */
export const UCSC_ROOT = path.join(import.meta.dirname, '..')

export function readConfig(configPath: string) {
  return checked(readJSON(configPath), isUcscConfig, configPath)
}

export function readChecked<T>(file: string, guard: Guard<T>) {
  return checked(readJSON(file), guard, file)
}
