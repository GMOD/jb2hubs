import fs from 'fs'
import path from 'path'
import zlib from 'zlib'

//
// Which UCSC assemblies are NCBI-derived, and which RefSeq annotation belongs to
// each. downloadNcbiGff.sh turns the answer into a <db>-ncbiRefSeqGff track.
//
// The list of UCSC assemblies is fetched live on every make.sh run, so a new
// assembly arrives with no repo change -- and, until this existed, with no GFF,
// because the db -> accession map was a hand-written file nobody was prompted to
// edit. rn8 (GRCr8) is the case that made that visible: it is a GenArk-backed
// alias whose own nibPath spells out GCF_036323735.1, its refNames already ARE
// that assembly's RefSeq accessions, and its GenArk twin has carried the GFF
// track since the day it was built.
//
// Three evidence sources, strongest first. Each names an assembly, never merely
// a species -- hg19 and hg38 are both GCA_000001405.*, mm10 and mm39 both
// GCA_000001635.*, so a species-level match would attach the wrong annotation.
//

export type AccessionSource =
  | 'curated'
  | 'nibPath'
  | 'description'
  | 'asmEquivalent'

export interface DerivedAccession {
  db: string
  accession: string
  assemblyName: string
  source: AccessionSource
  /** asmEquivalent only: the pair matched sequence-for-sequence. */
  exact?: boolean
}

export interface GenomeListEntry {
  nibPath?: string
  description?: string
  sourceName?: string
}

const ACCESSION = /GC[AF]_\d{9}\.\d+/

/**
 * A GenArk-backed alias names its own RefSeq accession in nibPath
 * (`hub:/gbdb/genark/GCF/036/323/735/GCF_036323735.1`). This is the strongest
 * evidence there is: the accession is not a claim about an equivalent assembly,
 * it is the assembly the hub was built from.
 */
function fromNibPath(entry: GenomeListEntry) {
  const match = ACCESSION.exec(entry.nibPath ?? '')
  return match?.[0].startsWith('GCF_') ? match[0] : undefined
}

/**
 * A few native hub assemblies spell the accession in prose instead --
 * mpxvRivers' description is `MPXV-M5312_HM12_Rivers (MT903340.1/GCF_014621545.1)`.
 * sourceName is read too, but only a GCF counts: the GCA an entry like hg38's
 * `GRCh38 ... (GCA_000001405.15)` names is the GenBank submission, whose seqids
 * (CM000663.2) are not the ones a RefSeq GFF uses.
 */
function fromProse(entry: GenomeListEntry) {
  for (const field of [entry.description, entry.sourceName]) {
    const match = ACCESSION.exec(field ?? '')
    if (match?.[0].startsWith('GCF_')) {
      return match[0]
    }
  }
  return undefined
}

interface EquivalentRow {
  accession: string
  assemblyName: string
  exact: boolean
}

/**
 * UCSC's own answer to this question, for the golden-path assemblies that
 * predate GenArk. `hgFixed.asmEquivalent` relates a UCSC db to the GenBank,
 * RefSeq and Ensembl assemblies it is equivalent to, and counts how many
 * sequences the two sides share:
 *
 *   bosTau9  GCF_002263795.1_ARS-UCD1.2  ucsc  refseq  2211  2211  2211
 *
 * The three counts are sourceCount, destinationCount, matchCount. All three
 * equal means every sequence on both sides matched, which is exactly the
 * property a GFF needs -- its seqids resolve through the assembly's chromAlias
 * to real refNames. A partial match still earns a row (galGal6, rn6, oryCun2),
 * and is kept but flagged, because features on the unmatched sequences simply
 * will not display.
 *
 * The table is already on disk: make.sh rsyncs all of goldenPath/hgFixed/database.
 */
export function parseAsmEquivalent(text: string) {
  const rows = new Map<string, EquivalentRow[]>()
  for (const line of text.split('\n')) {
    const cols = line.split('\t')
    if (cols.length < 7) {
      continue
    }
    const [source, destination, sourceAuthority, destAuthority, ...counts] =
      cols
    const [sourceCount, destCount, matchCount] = counts.map(Number)
    let db: string | undefined
    let name: string | undefined
    if (sourceAuthority === 'ucsc' && destAuthority === 'refseq') {
      db = source
      name = destination
    } else if (destAuthority === 'ucsc' && sourceAuthority === 'refseq') {
      db = destination
      name = source
    }
    if (!db || !name) {
      continue
    }
    const match = ACCESSION.exec(name)
    if (!match) {
      continue
    }
    const entry = {
      accession: match[0],
      assemblyName: name.slice(match[0].length + 1) || name,
      exact: matchCount === sourceCount && matchCount === destCount,
    }
    rows.set(db, [...(rows.get(db) ?? []), entry])
  }
  return rows
}

/**
 * One row per db out of the several asmEquivalent can hold (it lists both
 * directions, and sometimes two RefSeq versions of one assembly). An exact
 * match always beats a partial one; among equals the later accession version
 * wins, since that is the newer RefSeq build of the same sequences.
 */
function bestEquivalent(candidates: EquivalentRow[]) {
  return candidates.reduce<EquivalentRow | undefined>((best, row) => {
    if (!best || (row.exact && !best.exact)) {
      return row
    }
    return row.exact === best.exact && row.accession > best.accession
      ? row
      : best
  }, undefined)
}

/**
 * Whether a RefSeq GFF's seqids can reach this assembly's refNames at all.
 *
 * `database/chromAlias.txt.gz` is (alias, chrom, source) triples, and the source
 * column says outright whether UCSC knows the RefSeq names:
 *
 *   NC_000884.1  chrM       refseq      <- cavPor3, usable
 *   1            chr1       ensembl     <- oryCun2, nothing a GFF could match
 *
 * Without a refseq row the GFF loads and displays nothing, because every
 * NC_/NW_ seqid resolves to no refName. loxAfr3, musFur1 and oryCun2 are in
 * asmEquivalent and fail here; aptMan1's refNames are RefSeq accessions with
 * UCSC's dot-to-v mangling (NW_013995860v1) and it publishes no alias table at
 * all, so it fails here too.
 *
 * Hub assemblies (GenArk-backed aliases, native UCSC hubs) have no rsync'd
 * database dir and do not need one -- their refNames are the NCBI accessions.
 */
export function hasRefSeqAliases(dbDir: string) {
  const file = path.join(dbDir, 'chromAlias.txt.gz')
  if (!fs.existsSync(file)) {
    return false
  }
  const text = new TextDecoder().decode(zlib.gunzipSync(fs.readFileSync(file)))
  return text
    .split('\n')
    .some(line => (line.split('\t')[2] ?? '').split(',').includes('refseq'))
}

/**
 * A curated row, which is `db<tab>accession<tab>assemblyName` and wins over
 * anything derived. `-` as the accession means "never build a GFF for this db",
 * so an assembly that trips the detection can be turned off without deleting
 * the evidence that found it.
 */
export function parseCuratedTsv(text: string) {
  const curated = new Map<string, { accession: string; assemblyName: string }>()
  for (const line of text.split('\n')) {
    if (!line.trim() || line.startsWith('#')) {
      continue
    }
    const [db, accession, assemblyName] = line.split('\t')
    if (db && accession) {
      curated.set(db, { accession, assemblyName: assemblyName ?? '' })
    }
  }
  return curated
}

export function deriveNcbiAccessions({
  genomes,
  curated,
  asmEquivalent,
  dbDirFor,
}: {
  genomes: Record<string, GenomeListEntry>
  curated: Map<string, { accession: string; assemblyName: string }>
  asmEquivalent: Map<string, EquivalentRow[]>
  dbDirFor: (db: string) => string
}) {
  const derived: DerivedAccession[] = []
  for (const [db, entry] of Object.entries(genomes)) {
    const override = curated.get(db)
    if (override) {
      if (override.accession !== '-') {
        derived.push({ db, ...override, source: 'curated' })
      }
      continue
    }

    const nibPath = fromNibPath(entry)
    if (nibPath) {
      derived.push({
        db,
        accession: nibPath,
        assemblyName: entry.description ?? '',
        source: 'nibPath',
      })
      continue
    }

    const isHub = !!entry.nibPath?.startsWith('hub:')
    const prose = fromProse(entry)
    if (prose && isHub) {
      derived.push({
        db,
        accession: prose,
        assemblyName: entry.description ?? '',
        source: 'description',
      })
      continue
    }

    const equivalent = bestEquivalent(asmEquivalent.get(db) ?? [])
    if (equivalent && (isHub || hasRefSeqAliases(dbDirFor(db)))) {
      derived.push({ db, ...equivalent, source: 'asmEquivalent' })
    }
  }
  return derived.sort((a, b) => a.db.localeCompare(b.db))
}

export function formatTsv(rows: DerivedAccession[]) {
  const lines = rows.map(
    row =>
      `${row.db}\t${row.accession}\t${row.assemblyName}\t${row.source}${row.exact === false ? '\tpartial-sequence-match' : ''}`,
  )
  return `${lines.join('\n')}\n`
}

// CLI: prints the merged map as `db<tab>accession<tab>assemblyName<tab>source`.
if (import.meta.main) {
  const [listJson, downloadsDir, curatedTsv] = process.argv.slice(2)
  if (!listJson || !downloadsDir || !curatedTsv) {
    console.error(
      'Usage: node deriveNcbiAccessions.ts <listJson> <downloadsDir> <curatedTsv>',
    )
    process.exit(1)
  }

  const { ucscGenomes } = JSON.parse(fs.readFileSync(listJson, 'utf8')) as {
    ucscGenomes: Record<string, GenomeListEntry>
  }

  // hgFixed has no rsync stamp of its own and is pulled on the same run that
  // reads it, so an absent table means --skip-download on a cold tree. Saying so
  // matters: silence would read as "UCSC knows of no equivalents", which drops
  // 58 assemblies rather than reporting a missing input.
  const equivalentFile = path.join(
    downloadsDir,
    'hgFixed/hgFixed/database/asmEquivalent.txt.gz',
  )
  let asmEquivalent = new Map<string, EquivalentRow[]>()
  if (fs.existsSync(equivalentFile)) {
    asmEquivalent = parseAsmEquivalent(
      new TextDecoder().decode(
        zlib.gunzipSync(fs.readFileSync(equivalentFile)),
      ),
    )
  } else {
    console.error(`No asmEquivalent table at ${equivalentFile}`)
  }

  process.stdout.write(
    formatTsv(
      deriveNcbiAccessions({
        genomes: ucscGenomes,
        curated: parseCuratedTsv(fs.readFileSync(curatedTsv, 'utf8')),
        asmEquivalent,
        dbDirFor: db => path.join(downloadsDir, db, db, 'database'),
      }),
    ),
  )
}
