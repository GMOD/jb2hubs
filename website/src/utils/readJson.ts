import fs from 'fs'

export function isEnoent(e: unknown) {
  return e instanceof Error && 'code' in e && e.code === 'ENOENT'
}

// A JSON file that may be absent; any other failure, a parse error included,
// throws
export function readJsonIfPresent<T>(file: string): T | undefined {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf-8')) as T
  } catch (e) {
    if (isEnoent(e)) {
      return undefined
    }
    throw e
  }
}
