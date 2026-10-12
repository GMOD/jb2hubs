import { HttpError, myfetchtextWithRetry, resolve } from './util.ts'

const INCLUDE_LINE = /^include[ \t]+(\S+)[^\n]*$/gm

export function includeNames(text: string) {
  return [...text.matchAll(INCLUDE_LINE)].map(m => m[1]!)
}

/**
 * Replaces each `include <name>` line with the text `includes[name]`. A name the
 * map lacks keeps no tracks: the line is dropped, as @gmod/ucsc-hub drops it.
 */
export function spliceIncludes(
  text: string,
  includes: Record<string, string>,
  seen = new Set<string>(),
): string {
  return text.replace(INCLUDE_LINE, (_line, name: string) => {
    const body = includes[name]
    if (body === undefined || seen.has(name)) {
      return ''
    }
    return `\n${spliceIncludes(body, includes, new Set([...seen, name]))}\n`
  })
}

/**
 * Fetches every file `text` includes, nested ones too, relative to `baseUrl`.
 * A 404 or 410 leaves the name out of the result; any other failure throws.
 */
export async function fetchIncludes(
  text: string,
  baseUrl: string,
  includes: Record<string, string> = {},
  depth = 0,
) {
  if (depth > 5) {
    return includes
  }
  await Promise.all(
    includeNames(text)
      .filter(name => !(name in includes))
      .map(async name => {
        try {
          includes[name] = await myfetchtextWithRetry(resolve(name, baseUrl))
        } catch (e) {
          if (
            !(e instanceof HttpError && (e.status === 404 || e.status === 410))
          ) {
            throw e
          }
          console.warn(`Included trackDb ${name} is gone: ${e.message}`)
          return
        }
        await fetchIncludes(includes[name], baseUrl, includes, depth + 1)
      }),
  )
  return includes
}
