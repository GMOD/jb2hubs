#!/usr/bin/env node
// Writes website/src/syntenyTracks.json: every SyntenyTrack in the hosted
// configs, and the assembly info the /synteny selector needs for the genomes
// those tracks name. It is the shape the page hands to its island verbatim, so
// it carries only what the client reads — no adapters, no config paths, and no
// info for the 52,000 assemblies that take part in no synteny track.
import { readFile, readdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

import type {
  AssemblyInfo,
  AssemblySource,
  SyntenyCatalogData,
  SyntenyTrackSummary,
} from '../website/src/lib/syntenyCatalog.ts'

interface Config {
  assemblies?: {
    name: string
    displayName?: string
    sequence?: {
      metadata?: {
        commonName?: string
        scientificName?: string
        organism?: string
        ucsc?: { taxId?: string | number }
      }
    }
  }[]
  tracks?: {
    type?: string
    trackId?: string
    name?: string
    assemblyNames?: string[]
  }[]
  defaultSession?: {
    views?: { init?: { tracks?: string[] } }[]
  }
}

interface ConfigAssembly {
  commonName?: string
  scientificName?: string
  taxonId?: number
  geneTrack: string
}

interface ConfigFacts {
  tracks: SyntenyTrackSummary[]
  assemblies: Record<string, ConfigAssembly>
}

interface NamedInfo {
  commonName?: string
  scientificName?: string
  taxonId?: number
}

async function* walkDirectory(
  dir: string,
  pattern: string,
): AsyncGenerator<string> {
  const entries = await readdir(dir, { withFileTypes: true })
  for (const entry of entries) {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) {
      yield* walkDirectory(path, pattern)
    } else if (entry.isFile() && entry.name === pattern) {
      yield path
    }
  }
}

function parseTaxId(taxId: string | number | undefined) {
  const n = Number(taxId)
  return Number.isInteger(n) && n > 0 ? n : undefined
}

// The gene track a synteny panel opens for this genome. The two hosting sides
// name it differently and it is not the same file: a UCSC config carries the
// NCBI RefSeq GFF3 as `<db>-ncbiRefSeqGff` on the 75 NCBI-derived assemblies,
// while a GenArk hub carries UCSC's genePred-derived bigBed as
// `<accession>-ncbiRefSeq` (`-ncbiGene` on the microbial hubs). Anything else
// opens what the config's own defaultSession opens, which generateDefaultSessions
// already picked as the best gene track a UCSC assembly has (refGene, ensGene,
// ...), rather than re-implementing that order here. A GenArk defaultSession
// names no tracks at all, and a GenBank-only hub has no NCBI annotation, so
// the last resort is its gene predictions in UCSC's preference order.
function geneTrackFor(name: string, config: Config) {
  const ids = new Set(config.tracks?.map(t => t.trackId))
  const candidates = [
    `${name}-ncbiRefSeqGff`,
    `${name}-ncbiRefSeq`,
    `${name}-ncbiGene`,
    ...(config.defaultSession?.views?.[0]?.init?.tracks ?? []),
    `${name}-augustus`,
    `${name}-xenoRefGene`,
  ]
  return candidates.find(id => ids.has(id)) ?? ''
}

async function readConfig(filePath: string): Promise<ConfigFacts> {
  const facts: ConfigFacts = { tracks: [], assemblies: {} }
  try {
    const config: Config = JSON.parse(await readFile(filePath, 'utf-8'))
    for (const asm of config.assemblies ?? []) {
      const meta = asm.sequence?.metadata
      facts.assemblies[asm.name] = {
        commonName: meta?.commonName ?? meta?.organism ?? asm.displayName,
        scientificName: meta?.scientificName,
        taxonId: parseTaxId(meta?.ucsc?.taxId),
        geneTrack: geneTrackFor(asm.name, config),
      }
    }
    for (const track of config.tracks ?? []) {
      if (
        track.type === 'SyntenyTrack' &&
        track.trackId &&
        track.name &&
        track.assemblyNames
      ) {
        facts.tracks.push({
          trackId: track.trackId,
          name: track.name,
          assemblyNames: track.assemblyNames,
        })
      }
    }
  } catch (error) {
    console.error(`Error processing ${filePath}:`, error)
  }
  return facts
}

async function readConfigs(files: AsyncIterable<string> | Iterable<string>) {
  const all: ConfigFacts = { tracks: [], assemblies: {} }
  for await (const filePath of files) {
    const facts = await readConfig(filePath)
    all.tracks.push(...facts.tracks)
    Object.assign(all.assemblies, facts.assemblies)
  }
  return all
}

async function loadGenArkInfo() {
  const result: Record<string, NamedInfo> = {}
  const assemblies = JSON.parse(
    await readFile('website/processedHubJson/all.json', 'utf-8'),
  ) as {
    accession: string
    commonName?: string
    scientificName?: string
    taxonId?: number
  }[]
  for (const asm of assemblies) {
    result[asm.accession] = {
      commonName: asm.commonName,
      scientificName: asm.scientificName,
      taxonId: asm.taxonId,
    }
  }
  console.log(`Loaded ${Object.keys(result).length} GenArk assembly records`)
  return result
}

// The UCSC genome list as transformGenomeList.ts last wrote it — the same
// snapshot the /ucsc pages render — rather than a live API fetch, so a run is
// reproducible and works offline. Every entry carries organism, scientificName
// and taxId, which the hosted config does not: hs1's config knows itself only
// as "Jan. 2022 (T2T CHM13v2.0/hs1)".
async function loadUcscInfo() {
  const result: Record<string, NamedInfo & { accession?: string }> = {}
  const list = JSON.parse(await readFile('website/src/list.json', 'utf-8')) as {
    ucscGenomes: Record<
      string,
      {
        organism?: string
        scientificName?: string
        taxId?: number
        sourceName?: string
      }
    >
  }
  for (const [name, info] of Object.entries(list.ucscGenomes)) {
    result[name] = {
      commonName: info.organism,
      scientificName: info.scientificName,
      taxonId: parseTaxId(info.taxId),
      accession: /GC[AF]_\d+(?:\.\d+)?/.exec(info.sourceName ?? '')?.[0],
    }
  }
  console.log(`Loaded ${Object.keys(result).length} UCSC assembly records`)
  return result
}

async function main() {
  const genark = await loadGenArkInfo()
  const ucsc = await loadUcscInfo()
  // Retired UCSC assemblies the genome list no longer carries, so their tracks
  // still render with a name and are blocked as legacy rather than unknown.
  const legacy: Record<string, NamedInfo> = JSON.parse(
    await readFile(
      join(import.meta.dirname, 'legacyUcscAssemblies.json'),
      'utf-8',
    ),
  )

  console.log('Scanning hubs/ ...')
  const hubs = await readConfigs(walkDirectory('hubs', 'config.json'))
  console.log(`Found ${hubs.tracks.length} SyntenyTrack entries in hubs/`)

  console.log('Scanning ucsc2jbrowse/configs/ ...')
  const ucscConfigDir = 'ucsc2jbrowse/configs'
  const ucscConfigs = await readConfigs(
    (await readdir(ucscConfigDir))
      .filter(f => f.endsWith('.json'))
      .map(f => join(ucscConfigDir, f)),
  )
  console.log(
    `Found ${ucscConfigs.tracks.length} SyntenyTrack entries in ${ucscConfigDir}/`,
  )

  const tracks = [...hubs.tracks, ...ucscConfigs.tracks]
  const participating = new Set(tracks.flatMap(t => t.assemblyNames))

  // Field by field, most authoritative source first, so a source that knows
  // the taxon but not the name (or the reverse) still contributes what it has.
  // Whole-record precedence was what left hs1 with its config's displayName
  // and every GenArk assembly without the taxonId all.json holds for it.
  function describe(name: string): AssemblyInfo {
    const fromList = ucsc[name]
    const fromUcscConfig = ucscConfigs.assemblies[name]
    const fromHub = hubs.assemblies[name]
    const fromGenark = genark[name]
    const fromLegacy = legacy[name]
    const source: AssemblySource =
      fromList || fromUcscConfig
        ? 'ucsc'
        : fromHub || fromGenark
          ? 'genark'
          : 'legacy'
    const sources = [fromList, fromUcscConfig, fromHub, fromGenark, fromLegacy]
    const first = <K extends keyof NamedInfo>(key: K) =>
      sources.find(s => s?.[key] !== undefined)?.[key]
    return {
      commonName: first('commonName'),
      scientificName: first('scientificName'),
      source,
      taxonId: first('taxonId'),
      accession: fromList?.accession,
      geneTrack: fromUcscConfig?.geneTrack ?? fromHub?.geneTrack ?? '',
    }
  }

  const assemblyInfo: Record<string, AssemblyInfo> = {}
  for (const name of [...participating].sort()) {
    assemblyInfo[name] = describe(name)
  }

  const infos = Object.values(assemblyInfo)
  const count = (pred: (info: AssemblyInfo) => boolean) =>
    infos.filter(pred).length
  console.log(
    `${tracks.length} tracks over ${infos.length} assemblies: ` +
      `${count(i => i.source === 'legacy')} legacy, ` +
      `${count(i => i.taxonId === undefined)} without taxonId, ` +
      `${count(i => !i.geneTrack)} without a gene track`,
  )
  const nameless = Object.entries(assemblyInfo)
    .filter(([, info]) => !info.commonName)
    .map(([name]) => name)
  if (nameless.length > 0) {
    console.log(`Assemblies without a name: ${nameless.join(', ')}`)
  }

  const output: SyntenyCatalogData = { tracks, assemblyInfo }
  const outputFile = 'website/src/syntenyTracks.json'
  await writeFile(outputFile, JSON.stringify(output, null, 2))
  console.log(`Wrote ${outputFile}`)
}

main().catch((error: unknown) => {
  console.error(error)
  process.exitCode = 1
})
