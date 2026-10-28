#!/usr/bin/env node
// Fails on a catch clause or .catch() handler that never binds its error, and
// so cannot test for the error it expects (CLAUDE.md). ALLOWED holds the
// reviewed ones per file; a count that drops has to drop here too.

import { execFileSync } from 'node:child_process'
import fs from 'node:fs'

const ALLOWED = {
  // a cache miss or unreadable object assembles fresh
  'aws/ortholog-assembler/src/index.ts': 1,
  'genark2jbrowse/src/staleNcbiGffs.ts': 1,
  // URL parse; waitForFunction timeouts; a JSON that is not a config
  'scripts/checkConfigCompat.mjs': 4,
  'scripts/checkDisplayTypes.mjs': 2,
  // a Fetch.fulfillRequest for a request the page already dropped
  'scripts/checkPangenomeLaunches.mjs': 1,
  'scripts/checkProteinLaunches.ts': 1,
  'scripts/checkTrackUrls.mjs': 1,
  'ucsc2jbrowse/src/measureItemRgbPalettes.ts': 1,
  'ucsc2jbrowse/src/mitoCodes.ts': 1,
  'website/src/components/neighborhoodClient.ts': 1,
  // forgets a rejected promise; the caller still receives the rejection
  'website/src/components/pangenomeGraphLayout.worker.ts': 1,
  // localStorage throws where site data is blocked
  'website/src/lib/localFlag.ts': 2,
  'website/src/lib/ucscLiveness.ts': 2,
}

const UNBOUND =
  /\bcatch\s*\{|\.catch\(\s*(?:async\s*)?(?:\(\s*\)|\(?_\w*\)?)\s*=>/g

const files = execFileSync(
  'git',
  ['ls-files', '*.ts', '*.tsx', '*.mjs', '*.js', '*.astro'],
  { encoding: 'utf8' },
)
  .split('\n')
  .filter(f => f && !f.startsWith('hubs/') && fs.existsSync(f))

const problems = []
for (const file of files) {
  const text = fs.readFileSync(file, 'utf8')
  const lines = [...text.matchAll(UNBOUND)].map(
    m => text.slice(0, m.index).split('\n').length,
  )
  const allowed = ALLOWED[file] ?? 0
  if (lines.length > allowed) {
    problems.push(
      `${file}:${lines.join(',')}: ${lines.length} catch(es) that never read the error (allowed ${allowed}); test for the expected error and rethrow the rest`,
    )
  } else if (lines.length < allowed) {
    problems.push(
      `${file}: ALLOWED in scripts/checkCatchAlls.mjs says ${allowed}, found ${lines.length}; lower it`,
    )
  }
}
for (const file of Object.keys(ALLOWED)) {
  if (!files.includes(file)) {
    problems.push(`${file}: in ALLOWED but not tracked; remove it`)
  }
}

if (problems.length) {
  console.error(problems.join('\n'))
  process.exit(1)
}
