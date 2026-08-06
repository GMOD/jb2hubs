#!/usr/bin/env node
/* global window, document -- page.evaluate() bodies run in the browser, not here */
//
// checkPangenomeLaunches.mjs
//
// Boots the pangenome explorer's launch URLs in a real hosted JBrowse build and
// reads back what the session ACTUALLY built — which display each track got,
// which views exist, whether the app error-paged.
//
// Why this is not covered by the unit tests: `pangenomeLinks.test.ts` asserts
// the spec we EMIT, and every one of those assertions passed while two launches
// were broken in the browser. A session spec is a request, and a host is free to
// ignore or reject parts of it:
//
//   - `latest` has no LinearMultiSampleVariantDisplay. Naming it in a track's
//     `displays[]` fails the config's MST union and takes down the WHOLE spec
//     session — the launch lands on "Select a view to launch". Naming it the
//     other way, as an inline display prop on the view's `tracks` entry, is
//     silently ignored instead and the callset opens as a single squashed row.
//     Neither shows up in a URL-shape test.
//   - The GraphGenomeView bundle that jbrowse.org/demos/hprc/config.json pins
//     boots on `main` and error-pages on `latest`
//     (`TypeError: (0,N.createSvgIcon) is not a function`). That config lives in
//     the jbrowse-components repo, so it can change with nothing pushed here —
//     the same reason check-plugin-urls and the config canary exist.
//
// Deliberately NOT in lint.yml or run.sh's gate_configs: it needs a browser, and
// its subject is a third-party demo config plus an unreleased host, so a failure
// here should not block an unrelated deploy. Run it by hand when touching
// website/src/components/pangenome*, when bumping the graph plugin, and — this
// is the one that matters — BEFORE setting `features.pangenome` on production,
// since that repoints every launch below from `main` to `latest`.
//
// Usage:
//   node scripts/checkPangenomeLaunches.mjs                 # staging (main)
//   node scripts/checkPangenomeLaunches.mjs --host latest   # what production would get
//   node scripts/checkPangenomeLaunches.mjs --loci mhc-hla,lpa
//
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { parseArgs } from 'node:util'

import { launch } from 'puppeteer-core'

// Same resolution as checkConfigCompat.mjs: puppeteer-core carries no Chromium.
function findChrome() {
  const candidates = [
    process.env.CHROME_PATH,
    '/usr/bin/google-chrome',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    ...fs
      .globSync(
        path.join(os.homedir(), '.cache/puppeteer/chrome/*/chrome-*/chrome'),
      )
      .sort()
      .reverse(),
  ].filter(Boolean)
  const found = candidates.find(c => fs.existsSync(c))
  if (!found) {
    throw new Error(
      `no browser found; set CHROME_PATH. Looked in: ${candidates.join(', ')}`,
    )
  }
  return found
}

const { values } = parseArgs({
  options: {
    host: { type: 'string', default: 'main' },
    loci: { type: 'string' },
    timeout: { type: 'string', default: '120000' },
  },
})

const HOST = `https://jbrowse.org/code/jb2/${values.host}`
const TIMEOUT = Number(values.timeout)

// The site's own builders, so this checks the real thing rather than a copy.
// They read `features.staging` for the host and for whether the matrix display
// is declared, and outside Vite that is false — so the spec is rebuilt here
// against the host actually being tested rather than imported wholesale.
const { HPRC_DATASET } =
  await import('../website/src/components/pangenomeDataset.ts')
const { graphLocusUrl, graphVcfLgvUrl } =
  await import('../website/src/components/pangenomeLinks.ts')

const wantStagingDisplay = values.host !== 'latest'

function retarget(url) {
  const out = new URL(
    url.replace(/\/code\/jb2\/[^/]+/, `/code/jb2/${values.host}`),
  )
  if (!wantStagingDisplay) {
    return out.toString()
  }
  // Staging additionally declares the matrix display on the inlined callset;
  // see HOST_HAS_MULTISAMPLE_VARIANT_DISPLAY in website/src/config/jbrowse.ts.
  const session = out.searchParams.get('session')
  if (session?.startsWith('spec-')) {
    const spec = JSON.parse(session.slice('spec-'.length))
    for (const track of spec.sessionTracks ?? []) {
      if (track.trackId === HPRC_DATASET.graphVcf.trackId && !track.displays) {
        track.displays = [
          {
            type: 'LinearMultiSampleVariantDisplay',
            displayId: `${track.trackId}-multisample`,
            renderingMode: 'phased',
            jexlFilters: [
              'jexl:feature.INFO.LV[0]==0 && alleleLength(feature)>=50',
            ],
            height: 340,
          },
        ]
      }
    }
    out.searchParams.set('session', `spec-${JSON.stringify(spec)}`)
  }
  return out.toString()
}

const wanted = values.loci?.split(',')
const loci = HPRC_DATASET.loci.filter(l => !wanted || wanted.includes(l.id))

const launches = []
for (const locus of loci) {
  launches.push({
    name: `${locus.id}: variants`,
    url: retarget(graphVcfLgvUrl(HPRC_DATASET, locus)),
    // The callset is the button's subject; a single-row display means the
    // declaration was ignored, which is a silent failure.
    expectDisplay: wantStagingDisplay
      ? {
          trackId: HPRC_DATASET.graphVcf.trackId,
          type: 'LinearMultiSampleVariantDisplay',
        }
      : undefined,
  })
  const graph = graphLocusUrl(HPRC_DATASET, locus)
  if (graph) {
    launches.push({
      name: `${locus.id}: graph`,
      url: retarget(graph),
      expectView: 'GraphGenomeView',
    })
  }
}

const browser = await launch({
  executablePath: findChrome(),
  args: ['--no-sandbox', '--disable-dev-shm-usage'],
})

let failures = 0
for (const { name, url, expectView, expectDisplay } of launches) {
  const page = await browser.newPage()
  const problems = []
  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: TIMEOUT })
    // Wait for EITHER a session or the error page. Waiting on the session alone
    // means an app that error-paged — the exact failure this script exists to
    // catch — is reported as a timeout at the full TIMEOUT, with the real cause
    // (which is on screen the whole time) never read.
    await page.waitForFunction(
      () =>
        window.JBrowseRootModel?.session !== undefined ||
        /JBrowse Error|No matching type for union/.test(
          document.body.innerText,
        ),
      { timeout: TIMEOUT },
    )
    // The spec session expands after the model exists; give the views time to
    // build before reading them back.
    await new Promise(r => setTimeout(r, 12_000))

    const state = await page.evaluate(() => ({
      errorText: /JBrowse Error|No matching type for union/.test(
        document.body.innerText,
      )
        ? document.body.innerText.slice(0, 300)
        : undefined,
      views: (window.JBrowseRootModel?.session?.views ?? []).map(v => ({
        type: v.type,
        tracks: (v.tracks ?? []).map(t => ({
          trackId: t.configuration?.trackId,
          display: t.displays?.[0]?.type,
        })),
      })),
    }))

    if (state.errorText) {
      problems.push(`app error page: ${state.errorText.replace(/\s+/g, ' ')}`)
    }
    if (state.views.length === 0) {
      problems.push('the spec session built no views')
    }
    if (expectView && !state.views.some(v => v.type === expectView)) {
      problems.push(`no ${expectView} in the session`)
    }
    if (expectDisplay) {
      const track = state.views
        .flatMap(v => v.tracks)
        .find(t => t.trackId === expectDisplay.trackId)
      if (!track) {
        problems.push(`track ${expectDisplay.trackId} never opened`)
      } else if (track.display !== expectDisplay.type) {
        problems.push(
          `${expectDisplay.trackId} opened as ${track.display}, wanted ${expectDisplay.type}`,
        )
      }
    }
  } catch (e) {
    problems.push(`${e}`.split('\n')[0])
  }
  await page.close()

  if (problems.length) {
    failures++
    console.log(`FAIL ${name}`)
    for (const p of problems) {
      console.log(`       ${p}`)
    }
  } else {
    console.log(`ok   ${name}`)
  }
}

await browser.close()
console.log(
  failures
    ? `\n${failures}/${launches.length} launches failed on ${HOST}`
    : `\nall ${launches.length} launches boot on ${HOST}`,
)
process.exit(failures ? 1 : 0)
