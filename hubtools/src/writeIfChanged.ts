import * as fs from 'fs'
import * as path from 'path'

import { formatJson } from './formatJson.ts'

export function writeIfChanged(file: string, text: string | undefined) {
  let existing: string | undefined
  try {
    existing = fs.readFileSync(file, 'utf8')
  } catch {}
  if (text === undefined) {
    if (existing !== undefined) {
      fs.rmSync(file)
    }
    return existing !== undefined
  }
  if (text === existing) {
    return false
  }
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(file, text)
  return true
}

export function writeJsonIfChanged(file: string, data: unknown) {
  return writeIfChanged(file, formatJson(data))
}
