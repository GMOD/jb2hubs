import fs from 'fs'
import path from 'path'

//
// Mirroring the assembly sidecar files (chrom.sizes, chromAlias, cytoBand)
// alongside the config that names them.
//
// An assembly does not "partially" load: jbrowse-core's assembly.loadPre()
// fetches the sequence regions (chrom.sizes), refNameAliases, cytobands and the
// genetic-code sidecar in one Promise.all, and any single rejection fails the
// whole assembly -- which in the app is the confusing "nothing loads at all"
// state, not a missing track. Every one of those files used to be served by
// hgdownload, so a UCSC outage took our browsers down with it even though the
// configs and all the derived data are on our own bucket.
//
// So the three small ones are copied into the assembly's own directory next to
// config.json and the config is rewritten to name them relatively. UCSC still
// serves the 2bit (too big to mirror, and one we accept degrading): with the
// sidecars local, a UCSC outage costs the sequence track rather than the
// session.
//
// Relative is safe on every host we support: jbrowse-web stamps `baseUri` next
// to any `uri` it finds while loading a config from a url, and TwoBitAdapter's
// preProcessSnapshot has carried that baseUri into chromSizesLocation since
// v4.0.0 (the support floor) -- the adapter node holds both `uri` (the 2bit)
// and `chromSizes`, so the stamp lands. See
// agent-docs/architectural-decision-records/0003-mirror-assembly-sidecars.md.
//

/** The shape mirrorAssemblySidecars needs out of an assembly config entry. */
export interface AssemblySidecarTarget {
  name: string
  sequence?: {
    adapter: Record<string, unknown>
  }
  refNameAliases?: {
    adapter: Record<string, unknown>
  }
  cytobands?: {
    adapter: Record<string, unknown>
  }
}

interface Sidecar {
  /** what to call it in logs */
  label: string
  /** the value currently in the config */
  value: string
  /** rewrites the config field to the mirrored file name */
  localize: (file: string) => void
}

/**
 * The sidecar fields of an assembly, in the order they appear in the config.
 * `chromSizes` is a bare string on the TwoBitAdapter; the other two are `uri`
 * fields on their adapters.
 */
export function assemblySidecars(assembly: AssemblySidecarTarget): Sidecar[] {
  const out: Sidecar[] = []
  const seq = assembly.sequence?.adapter
  if (seq && typeof seq.chromSizes === 'string') {
    out.push({
      label: 'chromSizes',
      value: seq.chromSizes,
      localize: file => {
        seq.chromSizes = file
      },
    })
  }
  for (const [label, adapter] of [
    ['refNameAliases', assembly.refNameAliases?.adapter],
    ['cytobands', assembly.cytobands?.adapter],
  ] as const) {
    if (adapter && typeof adapter.uri === 'string') {
      out.push({
        label,
        value: adapter.uri,
        localize: file => {
          adapter.uri = file
        },
      })
    }
  }
  return out
}

/**
 * What to name a mirrored file inside the assembly's directory. The upstream
 * basename, namespaced with the assembly name when it isn't already (UCSC's
 * bigZips files are `<db>.chrom.sizes`, but its database/ files are bare
 * `cytoBand.txt.gz`, which would collide with the derived track files that
 * share the directory).
 */
export function sidecarFileName(assemblyName: string, url: string) {
  const base = path.posix.basename(new URL(url).pathname)
  return base.startsWith(`${assemblyName}.`) ? base : `${assemblyName}.${base}`
}

function isRemote(value: string) {
  return value.startsWith('http://') || value.startsWith('https://')
}

function writeAtomic(dest: string, data: Buffer) {
  // A truncated file is worse than a missing one here: the config points at it
  // either way, but a half-written chrom.sizes loads as a valid assembly with
  // missing contigs. Rename is atomic within the directory.
  const tmp = `${dest}.tmp-${process.pid}`
  fs.writeFileSync(tmp, data)
  fs.renameSync(tmp, dest)
}

const delay = (ms: number) =>
  new Promise(resolve => {
    setTimeout(resolve, ms)
  })

/**
 * Downloads a url to a file, retrying with backoff. hgdownload drops
 * connections under concurrency (see assemblyAliasesAndCytobands.ts), and an
 * outage is exactly the case this whole feature exists for, so a single failed
 * GET must not be read as "this assembly has no chromAlias".
 */
export async function downloadToFile(
  url: string,
  dest: string,
  { retries = 3, timeoutMs = 60_000 } = {},
) {
  let lastError: unknown
  for (let attempt = 0; attempt < retries; attempt++) {
    if (attempt > 0) {
      await delay(1000 * 2 ** (attempt - 1))
    }
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) })
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`)
      }
      const buf = Buffer.from(await res.arrayBuffer())
      if (buf.length === 0) {
        throw new Error('empty response')
      }
      writeAtomic(dest, buf)
      return
    } catch (e) {
      lastError = e
    }
  }
  throw new Error(`failed to download ${url}: ${lastError}`)
}

export interface MirrorOptions {
  /** the assembly entry to rewrite (mutated in place) */
  assembly: AssemblySidecarTarget
  /** directory holding config.json; mirrored files land here */
  dir: string
  /** re-fetch even when a mirrored copy already exists */
  force?: boolean
  /**
   * Supplies the file's bytes from somewhere local instead of fetching it, for
   * the golden-path assemblies whose rsync'd database/ dir already holds the
   * same data. Returning undefined falls back to downloading.
   */
  provideLocal?: (info: { url: string; file: string }) => Buffer | undefined
  /** overridable so tests never touch the network */
  download?: (url: string, dest: string) => Promise<void>
  onWarn?: (msg: string) => void
}

export interface MirrorResult {
  /** whether the config was rewritten and needs writing back out */
  changed: boolean
  mirrored: string[]
  reused: string[]
  failed: string[]
}

/**
 * Mirrors an assembly's sidecar files into `dir` and rewrites the config to
 * name them relatively.
 *
 * A sidecar that can't be fetched is left pointing at its upstream url: no
 * worse than before, and it gets another chance next run. The config is only
 * ever rewritten to name a file that exists on disk at that moment.
 */
export async function mirrorAssemblySidecars({
  assembly,
  dir,
  force = false,
  provideLocal,
  download = downloadToFile,
  onWarn = console.warn,
}: MirrorOptions): Promise<MirrorResult> {
  const result: MirrorResult = {
    changed: false,
    mirrored: [],
    reused: [],
    failed: [],
  }
  for (const sidecar of assemblySidecars(assembly)) {
    const { label, value, localize } = sidecar
    if (!isRemote(value)) {
      // already mirrored by an earlier run; the file has to still be there,
      // since the config names it
      if (!fs.existsSync(path.join(dir, value))) {
        onWarn(`${assembly.name}: ${label} names missing local file ${value}`)
        result.failed.push(label)
      } else {
        result.reused.push(label)
      }
      continue
    }
    const file = sidecarFileName(assembly.name, value)
    const dest = path.join(dir, file)
    if (!force && fs.existsSync(dest) && fs.statSync(dest).size > 0) {
      localize(file)
      result.changed = true
      result.reused.push(label)
      continue
    }
    try {
      const local = provideLocal?.({ url: value, file })
      if (local === undefined) {
        await download(value, dest)
      } else {
        writeAtomic(dest, local)
      }
      localize(file)
      result.changed = true
      result.mirrored.push(label)
    } catch (e) {
      // left pointing upstream: still works whenever UCSC is up, and retried
      // on the next run
      onWarn(`${assembly.name}: could not mirror ${label} (${value}): ${e}`)
      result.failed.push(label)
    }
  }
  return result
}

/**
 * Runs `fn` over the items with at most `limit` in flight. Kept low against
 * hgdownload, which drops connections when a burst of requests arrives.
 */
export async function mapWithConcurrency<T>(
  items: T[],
  limit: number,
  fn: (item: T, index: number) => Promise<void>,
) {
  let next = 0
  async function worker() {
    while (next < items.length) {
      const i = next++
      await fn(items[i]!, i)
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, () => worker()),
  )
}
