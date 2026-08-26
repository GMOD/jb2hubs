#!/usr/bin/env node
/* eslint-disable no-console */
//
// checkPluginUrls.mjs
//
// Every `plugins[].url` our configs name, fetched and checked. This is the one
// field that can kill a whole session rather than one track: PluginLoader runs
// Promise.all over the list, so a single url that 404s or fails to define its
// UMD global turns the app into an error page. See
// agent-docs/architectural-decision-records/0002-config-compat-across-jbrowse-versions.md
//
// The bundles live in a DIFFERENT repo (jbrowse-plugin-list rehosts them to
// jbrowse.org/plugins, and the `latest/` paths are uploaded no-cache so a
// publish reaches configs we already shipped). Nothing pushes to this repo when
// that happens, so no push-triggered CI here can see it. Hence a check that
// looks at production rather than at our working tree.
//
// SCOPE, because it is easy to over-trust this script: it proves a bundle is
// fetchable and defines its global. It canNOT see a bundle that loads fine and
// then throws from `configure()` — that also error-pages the app, and it is how
// @cmdcolin/jbrowse-plugin-hubs took out hg38/hg19/mm39/hs1 on every release
// from v4.0.0 to latest. Only checkConfigCompat.mjs (which boots a real host)
// catches that class. Run both.
//
// Usage:
//   node scripts/checkPluginUrls.mjs
//   node scripts/checkPluginUrls.mjs --json report.json
//
import fs from 'node:fs'
import path from 'node:path'
import { parseArgs } from 'node:util'

const { values } = parseArgs({
  options: {
    json: { type: 'string' },
    'genark-sample': { type: 'string', default: '200' },
  },
})

const root = path.join(import.meta.dirname, '..')

// Configs that compose plugin lists at request time, so they can drift from
// anything on disk. The merge lambda keeps its own plugin list in
// aws/config-merger, which is exactly why it belongs here.
const REMOTE_CONFIGS = [
  'https://jbrowse.org/ucsc/hg38/config.json',
  'https://jbrowse.org/ucsc/hg19/config.json',
  'https://jbrowse.org/hubs/genark/GCF/000/298/275/GCF_000298275.1/config.json',
  'https://0hifvzakej.execute-api.us-east-1.amazonaws.com/merge?hubIds=GCF_000001405.40',
]

// The plugin store's v1 layout. No longer republished, so a config naming it
// pins whatever version was there when it was frozen — this is how protein3d
// served 0.4.1 against a published 0.8.0. Not a hard failure: most configs still
// carry these until the next full regeneration flips them to `latest/`.
const LEGACY_PATH = /jbrowse\.org\/plugins\/[^"]*?\/dist\//
const isLegacy = url => LEGACY_PATH.test(url) && !url.includes('/latest/dist/')

// Anything not served from the plugin store at all. This class was invisible:
// ucsc2jbrowse/configs/renames.json named four unpkg.com bundles, frozen since
// 2025-08-11, and every one of them fetched fine and defined its global, so this
// script called them plain "ok" while isLegacy — which only knows the
// jbrowse.org v1 layout — said nothing. An off-store url is a snapshot of
// whatever npm's `latest` was when it was written; it is outside the rehost that
// makes a publish reach configs we already shipped.
const isOffStore = url => !url.startsWith('https://jbrowse.org/plugins/')

// The published store listing. A config entry naming `storePlugin` is asking
// the host to resolve the build against this at load time (jbrowse-plugin-list
// ADR 0008), so the package has to be IN it — a ref to something the store does
// not list resolves to nothing, and only the fallback url keeps that config
// working. Checking the pair here is what stops a rename or a retirement from
// quietly demoting every config that refs it back to a frozen url.
const PLUGIN_STORE_URL = 'https://jbrowse.org/plugin-store/v2/plugins.json'

// `${name}\0${storePlugin}\0${url}` -> Set of sources, for entries that name a
// package. Kept beside `found` rather than folded into it: `found` is keyed for
// the fetch-every-distinct-url pass, and a ref adds a dimension that pass does
// not care about.
const refs = new Map()
const addRef = (plugin, source) => {
  if (plugin.storePlugin === undefined) {
    return
  }
  const key = `${plugin.name}\0${plugin.storePlugin}\0${plugin.url ?? ''}`
  const sources = refs.get(key) ?? new Set()
  sources.add(source)
  refs.set(key, sources)
}

// A file in `configs/` that is not an assembly config at all. `configs/` is an
// append-only mirror of the built dir, so anything that ever got swept into it
// stays forever, still feeding mergeAll and both gates.
//
// This is not hypothetical: `ucscRenames/hg38.json` (a trackId -> new-name map,
// `DELETE` sentinels and all) was processed as a config once and left
// `renames.json` behind in both trees, `assemblies: [{}]`, carrying four
// unpkg.com plugin urls frozen since 2025-08-11. It was deleted 2026-08-05 and
// came back, because deleting the file treats the symptom while
// `$UCSC_BUILT_DIR/renames` on the build machine is what recreates it.
//
// The check above cannot catch it: those four urls fetched fine and defined
// their globals, so the plugin gate passed the whole time. An unnamed assembly
// is the discriminator, since every real config has exactly one and names it.
function namesAnAssembly(config) {
  return Boolean(config?.assemblies?.[0]?.name)
}

function pluginsOf(config) {
  return Array.isArray(config.plugins) ? config.plugins : []
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'))
}

// (name, url) pairs are governed by hubtools' defaultPlugins, so their
// cardinality is ~5 no matter how many configs exist. Parsing all 50k genark
// configs to rediscover 5 pairs would be pure waste, so: parse the UCSC surface
// exhaustively (cheap, 476 files), sample genark, and then grep the whole genark
// tree for any plugin url the sample did not already turn up.
function collectFromDisk() {
  // Keyed `${name}\0${url}`: NUL rather than a space because the key is split
  // back apart below and a url is not guaranteed space-free. Written as the \0
  // escape, not the literal byte it used to be -- a NUL in the first 8000 bytes
  // makes git call this file binary and refuse to diff it.
  const found = new Map() // `${name}\0${url}` -> Set of sources
  const orphans = [] // files in configs/ that are not assembly configs
  let ucscCount = 0
  const add = (name, url, source) => {
    const key = `${name}\0${url}`
    const sources = found.get(key) ?? new Set()
    sources.add(source)
    found.set(key, sources)
  }

  for (const dir of ['ucsc2jbrowse/configs', 'ucsc2jbrowse/configs-minimal']) {
    const abs = path.join(root, dir)
    if (fs.existsSync(abs)) {
      for (const f of fs.readdirSync(abs).filter(f => f.endsWith('.json'))) {
        ucscCount++
        const config = readJson(path.join(abs, f))
        if (!namesAnAssembly(config)) {
          orphans.push(`${dir}/${f}`)
        }
        for (const p of pluginsOf(config)) {
          add(p.name, p.url, dir)
          addRef(p, dir)
        }
      }
    }
  }

  const genarkConfigs = fs
    .globSync('hubs/**/config.json', { cwd: root })
    .map(f => path.join(root, f))
  const stride = Math.max(
    1,
    Math.floor(genarkConfigs.length / Number(values['genark-sample'])),
  )
  for (let i = 0; i < genarkConfigs.length; i += stride) {
    for (const p of pluginsOf(readJson(genarkConfigs[i]))) {
      add(p.name, p.url, 'genark (sampled)')
      addRef(p, 'genark (sampled)')
    }
  }

  return { found, genarkCount: genarkConfigs.length, orphans, ucscCount }
}

async function collectFromRemote(found) {
  const failures = []
  for (const url of REMOTE_CONFIGS) {
    const res = await fetch(url)
    if (res.ok) {
      const config = await res.json()
      for (const p of pluginsOf(config)) {
        const key = `${p.name}\0${p.url}`
        const sources = found.get(key) ?? new Set()
        sources.add(url)
        found.set(key, sources)
        addRef(p, url)
      }
    } else {
      failures.push({ url, status: res.status })
    }
  }
  return failures
}

// PluginLoader looks up `JBrowsePlugin${name}` on window after the script runs,
// so the config's declared name and the bundle's global have to agree. Accept
// any assignment form (`var X=`, `window.X=`, esbuild's `var X=(()=>{`).
function definesGlobal(body, name) {
  const global = `JBrowsePlugin${name}`
  return new RegExp(
    String.raw`(?:^|[^\w.])(?:var|let|const)?\s*(?:window\.|globalThis\.)?` +
      `${global}\\s*=`,
  ).test(body)
}

async function checkUrl(name, url) {
  const result = { name, url, legacy: isLegacy(url), offStore: isOffStore(url) }
  try {
    const res = await fetch(url)
    result.status = res.status
    result.contentType = res.headers.get('content-type') ?? ''
    const body = await res.text()
    result.bytes = body.length
    if (res.ok) {
      // A static-site 404 can come back as 200 text/html, which would sail past
      // a status-only check and then fail to define anything at runtime.
      if (!/javascript|ecmascript/.test(result.contentType)) {
        result.problem = `content-type is "${result.contentType}", not javascript`
      } else if (!definesGlobal(body, name)) {
        result.problem = `bundle does not define JBrowsePlugin${name}`
      }
    } else {
      result.problem = `HTTP ${res.status}`
    }
  } catch (e) {
    result.problem = `fetch failed: ${e}`
  }
  return result
}

// Counted, not written down. It read `scanned 476 ucsc configs` while the walk
// was actually reading 478, because the two stray renames.json files were in the
// count and nothing compared the two numbers. 476 is what 238 assemblies x
// {configs, configs-minimal} should be, so the literal was the intent and the
// disagreement with it was the only visible symptom of the stray.
const { found, genarkCount, orphans, ucscCount } = collectFromDisk()
console.log(
  `scanned ${ucscCount} ucsc configs + ${genarkCount} genark configs (sampled every ${Math.max(
    1,
    Math.floor(genarkCount / Number(values['genark-sample'])),
  )})`,
)

const configFailures = await collectFromRemote(found)

const pairs = [...found.keys()].map(k => {
  const [name, url] = k.split('\0')
  return { name, url, sources: [...found.get(k)] }
})

const results = []
for (const { name, url, sources } of pairs) {
  const result = await checkUrl(name, url)
  result.sources = sources
  results.push(result)
}

results.sort((a, b) => {
  const byName = a.name.localeCompare(b.name)
  return byName === 0 ? a.url.localeCompare(b.url) : byName
})
for (const r of results) {
  const flag = r.problem
    ? 'FAIL'
    : r.offStore
      ? 'ok (OFF-STORE)'
      : r.legacy
        ? 'ok (stale v1 path)'
        : 'ok'
  console.log(
    `  ${r.name.padEnd(12)} ${flag.padEnd(20)} ${r.bytes ?? '-'} bytes  ${r.url}`,
  )
  if (r.problem) {
    console.log(`      ${r.problem}`)
    console.log(`      named by: ${r.sources.join(', ')}`)
  }
  // Off-store urls always name their sources: unlike a stale v1 path, which a
  // full regeneration flips on its own, these come from a config the pipeline
  // is not rewriting, and finding which one is the whole job.
  if (!r.problem && r.offStore) {
    console.log(`      named by: ${r.sources.join(', ')}`)
  }
}

for (const f of configFailures) {
  console.log(`  CONFIG UNREACHABLE  HTTP ${f.status}  ${f.url}`)
}

const legacyCount = results.filter(r => r.legacy && !r.problem).length
if (legacyCount > 0) {
  console.log(
    `\n${legacyCount} url(s) use the frozen v1 plugin path; they will flip to latest/ on the next full regeneration.`,
  )
}

const offStoreCount = results.filter(r => r.offStore && !r.problem).length
if (offStoreCount > 0) {
  console.log(
    `\n${offStoreCount} url(s) are not served from the plugin store. A regeneration will NOT` +
      `\nflip these — find the config named above and fix or delete it.`,
  )
}

if (values.json) {
  fs.writeFileSync(
    values.json,
    JSON.stringify({ results, configFailures }, null, 2),
  )
}

if (orphans.length > 0) {
  console.error(
    `\n${orphans.length} file(s) in configs/ name no assembly, so they are not ` +
      `configs and nothing should be reading them:\n` +
      orphans.map(o => `  ${o}`).join('\n') +
      `\nDelete them here, and delete the matching directory under ` +
      `$UCSC_BUILT_DIR too or the copy step puts them straight back.`,
  )
}

// Every `storePlugin` a config names, against what the store actually
// publishes. Three ways this goes wrong, and each demotes the ref to its
// fallback url without anything else noticing:
//   - the package is not listed (renamed, or retired per ADR 0007)
//   - the store's UMD name disagrees with the config's, so a host that resolves
//     the ref and one that loads the url install it under different names
//   - the fallback url is not the store's `latestUrl`, i.e. hand-composed and
//     therefore able to be the stale v1 shape again
const refProblems = []
if (refs.size > 0) {
  const res = await fetch(PLUGIN_STORE_URL)
  if (!res.ok) {
    refProblems.push(`plugin store unreachable: HTTP ${res.status}`)
  } else {
    const { plugins: storePlugins } = await res.json()
    const byPackage = new Map(storePlugins.map(p => [p.packageName, p]))
    console.log(`\nstore refs (${refs.size} distinct):`)
    for (const key of [...refs.keys()].sort()) {
      const [name, pkg, url] = key.split('\0')
      const entry = byPackage.get(pkg)
      const problems = []
      if (!entry) {
        problems.push(`"${pkg}" is not in the plugin store`)
      } else {
        if (entry.name !== name) {
          problems.push(`store calls it "${entry.name}", config says "${name}"`)
        }
        if (url && entry.latestUrl && url !== entry.latestUrl) {
          problems.push(`fallback url is not the store's latestUrl`)
        }
      }
      console.log(
        `  ${name.padEnd(12)} ${(problems.length > 0 ? 'FAIL' : 'ok').padEnd(6)} ${pkg}`,
      )
      for (const problem of problems) {
        console.log(`      ${problem}`)
        console.log(`      named by: ${[...refs.get(key)].join(', ')}`)
        refProblems.push(`${name}: ${problem}`)
      }
    }
  }
}

const broken = results.filter(r => r.problem)
if (
  broken.length > 0 ||
  configFailures.length > 0 ||
  orphans.length > 0 ||
  refProblems.length > 0
) {
  console.error(
    `\n${broken.length} plugin url(s), ${configFailures.length} config url(s) and ` +
      `${refProblems.length} store ref(s) are broken. A bad plugin url error-pages ` +
      `every config that names it; a bad ref silently demotes one to its fallback.`,
  )
  process.exit(1)
}
console.log('\nAll plugin urls load and define their globals.')
