import * as fs from 'fs'
import * as path from 'path'

import { formatJson } from './formatJson.ts'
import { isErrnoCode } from './util.ts'

// A reader never sees a half-written file: a cut run leaves the old one, and
// the temp name matches the .tmp.* the syncs exclude.
export function writeAtomic(file: string, data: string | Buffer) {
  const tmp = path.join(
    path.dirname(file),
    `.tmp.${path.basename(file)}.${process.pid}`,
  )
  fs.writeFileSync(tmp, data)
  fs.renameSync(tmp, file)
}

export function writeIfChanged(file: string, text: string | undefined) {
  let existing: string | undefined
  try {
    existing = fs.readFileSync(file, 'utf8')
  } catch (e) {
    if (!isErrnoCode(e, 'ENOENT')) {
      throw e
    }
  }
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
  writeAtomic(file, text)
  return true
}

export function writeJsonIfChanged(file: string, data: unknown) {
  return writeIfChanged(file, formatJson(data))
}
