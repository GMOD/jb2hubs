import fs from 'fs'

import { checked } from 'hubtools/guards'

import type { Guard } from 'hubtools/guards'

export function isEnoent(e: unknown) {
  return e instanceof Error && 'code' in e && e.code === 'ENOENT'
}

// A JSON file that may be absent; any other failure, a parse error included,
// throws
function readJsonIfPresent(file: string): unknown {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf-8'))
  } catch (e) {
    if (isEnoent(e)) {
      return undefined
    }
    throw e
  }
}

export function readCheckedJson<T>(file: string, guard: Guard<T>) {
  return checked(JSON.parse(fs.readFileSync(file, 'utf-8')), guard, file)
}

export function readCheckedJsonIfPresent<T>(file: string, guard: Guard<T>) {
  const v = readJsonIfPresent(file)
  return v === undefined ? undefined : checked(v, guard, file)
}
