#!/usr/bin/env node
// Fails a built site whose pages link a same-site path that dist/ lacks, or a
// page path without its trailing slash, which costs a redirect per click.

import fs from 'node:fs'
import path from 'node:path'

const DIST = path.resolve(process.argv[2] ?? 'dist')
const HREF = /\bhref="(\/(?!\/)[^"#?]*)/g

if (!fs.existsSync(path.join(DIST, 'index.html'))) {
  console.error(`${DIST} holds no built site`)
  process.exit(1)
}

const files = new Set()
const pages = []
for (const entry of fs.readdirSync(DIST, {
  recursive: true,
  withFileTypes: true,
})) {
  if (entry.isFile()) {
    const rel = `/${path.relative(DIST, path.join(entry.parentPath, entry.name))}`
    files.add(rel)
    if (entry.name.endsWith('.html')) {
      pages.push(rel)
    }
  }
}

const exists = href => {
  const p = decodeURI(href)
  return p.endsWith('/') ? files.has(`${p}index.html`) : files.has(p)
}
const isPage = href => !path.posix.basename(href).includes('.')

const broken = new Map()
const note = (href, page) => {
  if (!broken.has(href)) {
    broken.set(href, { page, count: 0 })
  }
  broken.get(href).count++
}
const checked = new Map()
for (const page of pages) {
  const html = fs.readFileSync(path.join(DIST, page), 'utf8')
  for (const [, href] of html.matchAll(HREF)) {
    let verdict = checked.get(href)
    if (verdict === undefined) {
      verdict =
        href !== '/' && isPage(href) && !href.endsWith('/')
          ? 'no trailing slash'
          : exists(href)
            ? ''
            : 'no such file'
      checked.set(href, verdict)
    }
    if (verdict) {
      note(`${href} (${verdict})`, page)
    }
  }
}

console.error(
  `${pages.length} pages, ${checked.size} distinct same-site links, ${broken.size} broken`,
)
if (broken.size) {
  const rows = [...broken].sort((a, b) => b[1].count - a[1].count)
  for (const [href, { page, count }] of rows) {
    console.error(`  ${href}: ${count} link(s), e.g. on ${page}`)
  }
  process.exit(1)
}
