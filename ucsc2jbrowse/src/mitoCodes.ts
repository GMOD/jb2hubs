import fs from 'node:fs'
import path from 'node:path'

import { sidecarFileName } from 'hubtools'

// Everything addGeneticCodes does to avoid the network, kept together and apart
// from the script so it can be tested without running the script (which does its
// work at import time, over process.argv).
//
// Why any of it exists: addGeneticCodes runs over every assembly in
// POST_PROCESS_DIRS, and PIPELINE_SOURCES is deliberately broad -- so an edit
// anywhere under hubtools/src marks all ~240 assemblies changed and drags this
// step along with them. Over-invalidating is the right trade everywhere else
// here, because a reprocess is cheap on a warm tree: every per-file derivation
// is needs_rebuild-gated. This step was the one exception, with no gate at all,
// so a one-line library change cost a full round of NCBI eutils queries plus one
// chrom.sizes fetch per assembly from hgdownload -- unbudgeted, against the same
// host check-track-urls is held to 300 requests a day against.

export interface MitoCache {
  fetchedAt: number
  // null records "NCBI answered, and this taxon has no MGCId". That has to be
  // cached as firmly as a positive: without it every such taxon is re-queried
  // on every run, which was most of the cost.
  codes: Record<string, number | null>
}

// A taxon's mitochondrial genetic code does not change. The TTL is here so a
// genuine NCBI reclassification is not cached forever, not because the answer is
// expected to move -- a miss costs one efetch chunk, so a long TTL is cheap to
// be wrong about in the safe direction.
export const CACHE_TTL_MS = 180 * 24 * 60 * 60 * 1000

export function readMitoCache(cachePath: string, now = Date.now()): MitoCache {
  const empty: MitoCache = { fetchedAt: now, codes: {} }
  if (!fs.existsSync(cachePath)) {
    return empty
  }
  let parsed: unknown
  try {
    parsed = JSON.parse(fs.readFileSync(cachePath, 'utf8'))
  } catch {
    // A truncated cache is a cold start, not a failure: every entry in it is
    // re-derivable from one round of efetch.
    return empty
  }
  if (
    typeof parsed === 'object' &&
    parsed !== null &&
    'fetchedAt' in parsed &&
    'codes' in parsed &&
    typeof parsed.fetchedAt === 'number' &&
    typeof parsed.codes === 'object' &&
    parsed.codes !== null &&
    now - parsed.fetchedAt < CACHE_TTL_MS
  ) {
    const codes: Record<string, number | null> = {}
    for (const [taxId, code] of Object.entries(parsed.codes)) {
      if (typeof code === 'number' || code === null) {
        codes[taxId] = code
      }
    }
    return { fetchedAt: parsed.fetchedAt, codes }
  }
  return empty
}

export function writeMitoCache(cachePath: string, cache: MitoCache) {
  fs.writeFileSync(cachePath, JSON.stringify(cache, null, 2))
}

/**
 * Where this assembly's chrom.sizes can be read from disk, or undefined when it
 * has to come over the network.
 *
 * Two local shapes, and the second is the one that matters. Once
 * mirrorAssemblySidecars has run, `chromSizes` is a file name relative to the
 * config and the mirrored copy sits beside it. But addGeneticCodes runs in
 * Phase 4 and mirroring runs in finalizeConfigs afterwards, and
 * createAssemblies.sh rewrites config.json from scratch for every reprocessed
 * assembly -- so the freshly written config names the upstream url again even
 * though the previous run's mirrored file is still sitting next to it. Only
 * config.json is rewritten; the sidecars are not. Looking for it under the name
 * mirrorAssemblySidecars would have given it is what turns ~200 hgdownload
 * requests per full reprocess into zero, and it asks that module for the naming
 * rule rather than keeping a second copy of it.
 */
export function localChromSizesPath(
  chromSizes: string,
  configDir: string,
  assemblyName: string,
) {
  let candidate
  if (/^https?:\/\//.test(chromSizes)) {
    candidate = path.join(configDir, sidecarFileName(assemblyName, chromSizes))
  } else {
    candidate = path.join(configDir, chromSizes)
  }
  return fs.existsSync(candidate) ? candidate : undefined
}
