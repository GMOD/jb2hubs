#!/usr/bin/env node
/* global document -- page.evaluate() bodies run in the browser, not here */
//
// Opens each HPRC example on a site and clicks every row of its map. Run by
// hand against a dev server or production; run.sh does not.
//
// Usage:
//   pnpm check-pangenome-graphs https://genomes.jbrowse.org
//   pnpm check-pangenome-graphs http://localhost:4321 --out <dir> --examples cfh,c4
//
// With --out, results.json and every graph's SVG land in <dir>, and the row
// names are compared with the results.json a previous run left there.

import fs from 'node:fs'
import path from 'node:path'
import { parseArgs } from 'node:util'

import { TimeoutError, launch } from 'puppeteer-core'

import { findChrome } from './findChrome.mjs'

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    out: { type: 'string' },
    examples: { type: 'string' },
    timeout: { type: 'string', default: '45000' },
  },
})
const [base] = positionals
if (!base) {
  throw new Error(
    'usage: check-pangenome-graphs <base url> [--out dir] [--examples id,id] [--timeout ms]',
  )
}
const SITE = base.replace(/\/+$/, '')
const TIMEOUT = Number(values.timeout)
const OPENS_WITHOUT_GRAPH = new Set(['amy1'])
// what PangenomeGraph.tsx says where a cut passes FOLDED_NODE_LIMIT or the
// walk cut's limits: a limit the page states, not an error
const REFUSAL = 'This stretch of the graph is too large to draw.'

const resultsFile = values.out && path.join(values.out, 'results.json')
const previous =
  resultsFile && fs.existsSync(resultsFile)
    ? JSON.parse(fs.readFileSync(resultsFile, 'utf8'))
    : undefined
if (values.out) {
  fs.mkdirSync(values.out, { recursive: true })
}

const sleep = ms => new Promise(r => setTimeout(r, ms))

const graphState = page =>
  page.evaluate(() => {
    const fig = document.querySelector('figure.ui-graph')
    return {
      busy: fig?.getAttribute('aria-busy') === 'true',
      src: fig?.querySelector('img')?.getAttribute('src') ?? undefined,
      error: fig?.querySelector('.ui-error')?.textContent ?? undefined,
    }
  })

// A drawing has settled when the figure is not busy and shows an error, a new
// image, or after a few seconds the same one, as a click may redraw it so.
async function settle(page, prevSrc) {
  const start = Date.now()
  let state = await graphState(page)
  while (
    Date.now() - start < TIMEOUT &&
    (state.busy ||
      !(
        state.error ||
        (state.src && (state.src !== prevSrc || Date.now() - start > 3000))
      ))
  ) {
    await sleep(250)
    state = await graphState(page)
  }
  return { ...state, ms: Date.now() - start }
}

const saveSvg = (name, src) => {
  if (values.out && src?.startsWith('data:image/svg+xml')) {
    fs.writeFileSync(
      path.join(values.out, `${name}.svg`),
      decodeURIComponent(src.slice(src.indexOf(',') + 1)),
    )
  }
}

const readRow = button =>
  button.evaluate(b => ({
    name: b.querySelector('.ui-lane-name')?.textContent ?? '',
    share: b.querySelector('.ui-lane-share')?.textContent ?? '',
    unaligned: b.getAttribute('aria-disabled') === 'true',
  }))

const pangenomePage = `${SITE}/pangenomes/hprc/`
const browser = await launch({
  executablePath: findChrome(),
  args: ['--no-sandbox'],
  defaultViewport: { width: 1280, height: 1000 },
})

const listing = await browser.newPage()
await listing.goto(pangenomePage, { waitUntil: 'networkidle2' })
const wanted = values.examples?.split(',')
const examples = (
  await listing.evaluate(() =>
    [...document.querySelectorAll('select[aria-label="Examples"] option')]
      .map(o => ({ id: o.value, label: o.textContent }))
      .filter(o => o.id),
  )
).filter(e => !wanted || wanted.includes(e.id))
await listing.close()
if (examples.length === 0) {
  throw new Error(
    `no examples found on ${pangenomePage}${wanted ? ` named ${values.examples}` : ''}`,
  )
}

async function mapShown(page) {
  try {
    await page.waitForSelector('.ui-lanes', { timeout: TIMEOUT })
    return true
  } catch (e) {
    if (!(e instanceof TimeoutError)) {
      throw e
    }
    return false
  }
}

async function checkExample({ id, label }) {
  const page = await browser.newPage()
  const pageErrors = []
  page.on('pageerror', e => {
    pageErrors.push(String(e).split('\n')[0])
  })
  const problems = []
  const rows = []
  const notes = []
  await page.goto(`${pangenomePage}?region=${encodeURIComponent(label)}`, {
    waitUntil: 'domcontentloaded',
  })
  const mapped = await mapShown(page)
  const opened = mapped ? await settle(page) : undefined
  if (!mapped) {
    problems.push(`no map in ${TIMEOUT / 1000} s`)
  } else if (opened.error) {
    problems.push(`opens with a graph error: ${opened.error}`)
  } else if (!opened.src && !OPENS_WITHOUT_GRAPH.has(id)) {
    problems.push(`opens with no graph in ${TIMEOUT / 1000} s`)
  } else if (opened.src && OPENS_WITHOUT_GRAPH.has(id)) {
    problems.push(
      'opens with a graph now; take it off OPENS_WITHOUT_GRAPH in this script',
    )
  }
  saveSvg(`${id}__default`, opened?.src)

  const count = mapped ? (await page.$$('.ui-lane-btn')).length : 0
  for (let i = 0; i < count; i++) {
    const button = (await page.$$('.ui-lane-btn'))[i]
    const row = await readRow(button)
    if (row.unaligned) {
      rows.push({ ...row, drawn: false })
    } else {
      const before = await graphState(page)
      await button.click()
      await sleep(400)
      const s = await settle(page, before.src)
      saveSvg(`${id}__row${i}`, s.src)
      const refused = s.error === REFUSAL
      rows.push({
        ...row,
        drawn: !!s.src && !s.error,
        refused,
        error: refused ? undefined : s.error,
        ms: s.ms,
      })
      if (refused) {
        notes.push(`row "${row.name}": too large to draw`)
      } else if (s.error) {
        problems.push(`row "${row.name}": ${s.error}`)
      } else if (!s.src) {
        problems.push(`row "${row.name}": no graph in ${TIMEOUT / 1000} s`)
      }
      await button.click()
      await sleep(300)
    }
  }

  const names = rows.map(r => r.name)
  const repeated = [...new Set(names.filter((n, i) => names.indexOf(n) !== i))]
  for (const name of repeated) {
    problems.push(
      `${names.filter(n => n === name).length} rows named "${name}"`,
    )
  }
  for (const e of pageErrors) {
    problems.push(`page error: ${e}`)
  }
  if (opened && !opened.src) {
    notes.push('opens with no graph, as listed')
  }
  await page.close()
  return {
    id,
    label,
    opened: opened && {
      drawn: !!opened.src,
      error: opened.error,
      ms: opened.ms,
    },
    rows,
    problems,
    notes,
  }
}

const results = []
for (const example of examples) {
  const result = await checkExample(example)
  results.push(result)
  const drawn = result.rows.filter(r => r.drawn).length
  const refused = result.rows.filter(r => r.refused).length
  console.log(
    `${result.problems.length ? 'FAIL' : 'ok  '} ${result.id}: ${result.opened?.drawn ? 'opens with a graph' : 'opens with none'}, ${drawn} of ${result.rows.length} rows drawn${refused ? `, ${refused} too large` : ''}`,
  )
  for (const line of [...result.problems, ...result.notes]) {
    console.log(`       ${line}`)
  }
}
await browser.close()

if (resultsFile) {
  fs.writeFileSync(resultsFile, `${JSON.stringify(results, null, 1)}\n`)
}

const rowList = rows =>
  rows.map(r => `"${r.name}" ${r.share}`.trim()).join(', ')
const changed = (previous ?? []).flatMap(before => {
  const now = results.find(r => r.id === before.id)
  const was = new Set(before.rows.map(r => r.name))
  const is = new Set(now?.rows.map(r => r.name) ?? [])
  const gone = before.rows.filter(r => !is.has(r.name))
  const added = now?.rows.filter(r => !was.has(r.name)) ?? []
  return now && (gone.length || added.length)
    ? [
        `  ${before.id}: was ${gone.length ? rowList(gone) : 'none'}; now ${added.length ? rowList(added) : 'none'}`,
      ]
    : []
})
if (previous) {
  console.log(
    changed.length
      ? `\nrows renamed or split since the previous ${resultsFile}:\n${changed.join('\n')}`
      : `\nthe same row names as the previous ${resultsFile}`,
  )
}

const failed = results.filter(r => r.problems.length).length
const allRows = results.flatMap(r => r.rows)
const tally = `${allRows.filter(r => r.drawn).length} of ${allRows.length} rows drawn, ${allRows.filter(r => r.refused).length} too large`
console.log(
  failed
    ? `\n${failed}/${results.length} examples failed on ${SITE}; ${tally}`
    : `\nall ${results.length} examples draw on ${SITE}; ${tally}`,
)
process.exit(failed ? 1 : 0)
