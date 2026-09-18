import assert from 'node:assert'
import { globSync, readFileSync } from 'node:fs'
import { test } from 'node:test'

// The origin answers /gene?x with a 301 to /gene/?x, and CloudFront caches that
// redirect without the query string, so every later /gene?y lands on /gene/?x.
// An internal link that carries a query has to name the directory with its slash.
const slashlessWithQuery = [
  /["'`(]\/[a-z][\w/-]*[a-z0-9]\?/g,
  /action="\/[\w/-]*[a-z0-9]"/g,
  /'\/[\w/-]*[a-z0-9]' \+ location\.search/g,
]

test('internal links with a query string end their path in a slash', () => {
  const offenders = globSync('src/**/*.{ts,tsx,astro,md,mdx}')
    .filter(f => !f.endsWith('.test.ts'))
    .flatMap(f => {
      const text = readFileSync(f, 'utf8')
      return slashlessWithQuery.flatMap(re =>
        [...text.matchAll(re)].map(m => `${f}: ${m[0]}`),
      )
    })
  assert.deepEqual(offenders, [])
})
