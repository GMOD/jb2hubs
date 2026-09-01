import { execFileSync } from 'child_process'
import fs from 'fs'
import { gunzipSync } from 'node:zlib'
import path from 'path'

import { linkOrCopy } from 'hubtools'

import type { FinalizeStep } from './utils/finalizeStep.ts'

// downloadNcbiGff.sh leaves each NCBI-derived assembly's sorted, bgzipped
// RefSeq GFF3 here as <db>.gff.gz; the .csi rather than the .gff.gz is the
// witness that it finished (see needs_gff_fetch in lib/common.sh).
export const GFF_DIR = path.join(import.meta.dirname, '..', 'gff')

export const NCBI_GFF_TRACK_NAME = 'NCBI RefSeq - RefSeq All (GFF)'

function column(file: string, cols: number[]) {
  const text = new TextDecoder().decode(gunzipSync(fs.readFileSync(file)))
  return text.split('\n').flatMap(line => {
    const fields = line.split('\t')
    return cols
      .map(c => fields[c])
      .filter((f): f is string => f !== undefined && f !== '')
  })
}

// Every name this assembly can resolve a GFF seqid to: its own refNames, plus
// every alias of one. Golden-path assemblies answer from the rsync'd tables, so
// this needs no network and no prior build; a hub assembly has no database dir
// and answers from whatever a previous run mirrored beside its config.
function resolvableNames(dbDir: string, dir: string) {
  const names = new Set<string>()
  const chromInfo = path.join(dbDir, 'chromInfo.txt.gz')
  if (fs.existsSync(chromInfo)) {
    for (const n of column(chromInfo, [0])) {
      names.add(n)
    }
  }
  const chromAlias = path.join(dbDir, 'chromAlias.txt.gz')
  if (fs.existsSync(chromAlias)) {
    for (const n of column(chromAlias, [0, 1])) {
      names.add(n)
    }
  }
  if (fs.existsSync(dir)) {
    for (const f of fs.readdirSync(dir)) {
      if (
        f.endsWith('.chrom.sizes') ||
        f.endsWith('.chrom.sizes.txt') ||
        f.endsWith('.chromAlias.txt')
      ) {
        for (const line of fs
          .readFileSync(path.join(dir, f), 'utf8')
          .split('\n')) {
          for (const n of line.split('\t').slice(0, 6)) {
            if (n.trim()) {
              names.add(n)
            }
          }
        }
      }
    }
  }
  return names
}

// Whether this GFF's seqids reach this assembly at all.
//
// deriveNcbiAccessions.ts already asked whether RefSeq names are addressable
// here; this asks whether *these* RefSeq names are, which is the question a
// partial asmEquivalent match (galGal6, rn6) leaves open. Zero overlap means a
// track that loads and draws nothing, which is worse than no track: it reads as
// "this assembly has no NCBI annotation".
//
// Not being able to answer is not the same as answering no. A hub assembly on a
// cold tree has nothing mirrored yet, and refusing there would withhold the
// track from every GenArk-backed alias on its first build -- the exact case this
// whole detection pass exists to serve. Say so and proceed.
function seqidsResolve(db: string, gff: string, dbDir: string, dir: string) {
  const names = resolvableNames(dbDir, dir)
  if (names.size === 0) {
    console.warn(
      `${db}: no local chrom tables to check GFF seqids against; adding unverified`,
    )
    return true
  }
  const seqids = new Set(
    // a fragmented assembly lists tens of thousands of seqids, past the 1MB default
    execFileSync('tabix', ['-l', gff], { encoding: 'utf8', maxBuffer: 1 << 28 })
      .split('\n')
      .filter(Boolean),
  )
  const matched = [...seqids].filter(s => names.has(s)).length
  if (matched === 0) {
    console.warn(
      `Skipping ${db}: none of its ${seqids.size} GFF seqids resolve to a refName or alias`,
    )
    return false
  }
  return true
}

/**
 * Adds the full-resolution NCBI RefSeq GFF3 (rich gene -> mRNA -> CDS/exon
 * structure) as <db>-ncbiRefSeqGff, complementary to UCSC's own
 * genePred-derived ncbiRefSeq tracks, when downloadNcbiGff.sh has fetched one
 * and its seqids reach this assembly. The assembly's refNameAliases maps the
 * GFF's RefSeq accessions (NC_000001.11) to UCSC names (chr1) at load time, so
 * the GFF loads as-is. The built dir's <db>.gff.gz is a hard link to the
 * downloaded one.
 */
export const addNcbiRefSeqGffTrack: FinalizeStep = {
  name: 'NCBI RefSeq GFF tracks',
  run: ({ assemblyName, dir, dbDir, config, compareOnly }) => {
    const counts: Record<string, number> = {}
    const gff = path.join(GFF_DIR, `${assemblyName}.gff.gz`)
    const trackId = `${assemblyName}-ncbiRefSeqGff`
    // the config's own assembly name, which for a GenArk-backed alias is the
    // accession rather than the db
    const asm = config.assemblies[0]?.name ?? assemblyName
    if (
      fs.existsSync(`${gff}.csi`) &&
      !config.tracks.some(t => t.trackId === trackId) &&
      seqidsResolve(assemblyName, gff, dbDir, dir)
    ) {
      const fileName = `${assemblyName}.gff.gz`
      if (!compareOnly) {
        linkOrCopy(gff, path.join(dir, fileName))
        linkOrCopy(`${gff}.csi`, path.join(dir, `${fileName}.csi`))
      }
      config.tracks.push({
        type: 'FeatureTrack',
        trackId,
        name: NCBI_GFF_TRACK_NAME,
        adapter: {
          type: 'Gff3TabixAdapter',
          gffGzLocation: { uri: fileName, locationType: 'UriLocation' },
          index: {
            location: { uri: `${fileName}.csi`, locationType: 'UriLocation' },
            indexType: 'CSI',
          },
        },
        category: ['Genes and Gene Predictions'],
        assemblyNames: [asm],
      })
      counts.added = 1
    }
    return counts
  },
}
