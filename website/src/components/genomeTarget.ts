// Which genome a gene's JBrowse session opens on, and under what names.
//
// NCBI hands us an assembly accession and sequence names like NC_000017.11. A
// hosted config calls the same sequence something else — chr17 on both the UCSC
// golden-path configs and the GenArk hubs, whose canonical column is `ucsc` —
// and NC_000017.11 is only an alias there. That distinction is load-bearing:
// refName matching against a view's displayed regions (bpToPx, the connected
// hover/select highlight, centerAt) is exact and does NOT resolve aliases, so a
// session built on the accession opens on regions the MsaView and ProteinView
// can never light up. Both names come out of the same chromAlias file the
// config's RefNameAliasAdapter reads, so we read it too and rename at the source.
//
// The config itself is not one thing either. UCSC-native assemblies (hg38,
// mm39 — anything the assembly index gives a `ucscDb`) have no GenArk hub: the
// sharded path exists, but its 2bit and chromAlias 404 at hgdownload, so a
// session pointed there opens with no sequence at all. Those take the curated
// /ucsc/<db> config; everything else takes its GenArk hub. Same rule as
// accessionToJbrowseUrl, which is where it was first worked out.

import {
  genarkConfigPath,
  hostedUrl,
  ucscConfigPath,
} from '../config/jbrowse.ts'
import { fetchJson } from '../lib/fetchJson.ts'
import { loadStore } from './orthologDb.ts'

// Gene tracks a session can open under the collapsed exons, best first. RefSeq
// Select is one transcript per gene, which is the pick fetchGeneStructure makes
// too; the rest widen from there, down to the non-RefSeq gene sets old or
// sparsely annotated assemblies carry instead. `ncbiGff` is GenArk's name for
// the full-resolution NCBI GFF3; `ncbiRefSeqGff` is UCSC's.
const GENE_TRACK_SUFFIXES = [
  'ncbiRefSeqSelect',
  'ncbiRefSeqCurated',
  'ncbiRefSeqGff',
  'ncbiRefSeq',
  'ncbiGff',
  'refGene',
  'ensGene',
  'knownGene',
  'sgdGene',
  'augustusGene',
  'xenoRefGene',
]

export function pickGeneTrack(
  assembly: string,
  trackIds: string[],
): string | undefined {
  const ids = new Set(trackIds)
  return GENE_TRACK_SUFFIXES.map(s => `${assembly}-${s}`).find(id =>
    ids.has(id),
  )
}

// The two full-resolution GFF3 tracks are the ones `latest` cannot label (see
// onGeneTrackHost in config/jbrowse.ts); a session opening one of them goes to
// the gene-track host, as every /orthologs launch does.
export function isNcbiGffTrack(trackId: string | undefined) {
  return /-(ncbiRefSeqGff|ncbiGff)$/.test(trackId ?? '')
}

// Variant evidence to open under the gene, where the config carries it: the
// UCSC ClinVar SNV track and the AlphaMissense pathogenicity signal, which is
// the pairing the protein browser paper's BRAF case study is built on. Only the
// human golden-path configs have them today; elsewhere this is empty.
const VARIANT_TRACK_SUFFIXES = ['clinvarMain', 'alphaMissense']

export function pickVariantTracks(assembly: string, trackIds: string[]) {
  const ids = new Set(trackIds)
  return VARIANT_TRACK_SUFFIXES.map(s => `${assembly}-${s}`).filter(id =>
    ids.has(id),
  )
}

// chromAlias.txt in either of the two shapes UCSC publishes:
//
//   GenArk       `# refseq  assembly  genbank  ncbi  ucsc`, one column per
//                naming scheme. The config's RefNameAliasAdapter names the
//                canonical one in refNameColumnHeaderName ("ucsc").
//   golden path  `# sequenceName  alias names  UCSC database: hg38` — the
//                header labels only the first column, and that column is
//                canonical. The config's adapter names no column.
//
// So an absent (or unmatched) canonicalColumn means column 0, which is right for
// the golden-path file and the only sane guess for anything else. Every cell in
// a row maps to that row's canonical name, the canonical name included, which
// makes the lookup idempotent — a name that is already canonical stays put.
export function parseChromAlias(
  text: string,
  canonicalColumn?: string,
): Map<string, string> {
  const [header = '', ...rows] = text.trim().split('\n')
  const columns = header.replace(/^#\s*/, '').split('\t')
  const found = canonicalColumn ? columns.indexOf(canonicalColumn) : -1
  const canonicalIdx = found >= 0 ? found : 0
  const map = new Map<string, string>()
  for (const row of rows) {
    const cells = row.split('\t')
    const canonical = cells[canonicalIdx]
    if (canonical) {
      for (const cell of cells) {
        if (cell) {
          map.set(cell, canonical)
        }
      }
    }
  }
  return map
}

export interface GenomeTarget {
  // what a launch URL passes as ?config=. Site-relative, like every other launch
  // on the site: jbrowse-web resolves it against its OWN origin, which is the
  // jbrowse.org bucket. Reading the same file from here needs hostedUrl().
  configUrl: string
  // the assembly name inside that config: a UCSC db, or the accession
  assemblyName: string
  // the gene track to open under the collapsed exons, when the config has one
  geneTrackId?: string
  // ClinVar / AlphaMissense, where the config has them
  variantTrackIds: string[]
  // NCBI's name for a sequence -> the config's canonical name for it
  canonicalRefName: (refName: string) => string
}

interface ConfigShape {
  assemblies?: {
    refNameAliases?: {
      adapter?: { refNameColumnHeaderName?: string; uri?: string }
    }
  }[]
  tracks?: { trackId: string }[]
}

// A config names its chromAlias relatively and jbrowse-web resolves it against
// the config's own URL, so resolve it against the same absolute URL we read the
// config from.
function aliasUrl(metaUrl: string, uri: string) {
  return new URL(uri, metaUrl).href
}

async function loadAliases(metaUrl: string, config: ConfigShape) {
  const adapter = config.assemblies?.[0]?.refNameAliases?.adapter
  if (!adapter?.uri) {
    return undefined
  }
  // Best-effort: an unreachable alias file costs the rename, not the session,
  // and leaving the accession in place is what the page did before this existed.
  const text = await fetch(aliasUrl(metaUrl, adapter.uri))
    .then(res => (res.ok ? res.text() : ''))
    .catch(() => '')
  return text
    ? parseChromAlias(text, adapter.refNameColumnHeaderName)
    : undefined
}

// The metadata read is separate from the config a launch names, because on the
// UCSC side they are different files: hg38's config.json is 2 MB and its
// minimal.json — same assembly node, same alias adapter, and a subset of the
// same tracks — is 7 KB. Anything minimal.json holds, config.json holds too, so
// picking a track out of the small one is safe. A db without one falls back.
async function loadTarget(
  configUrl: string,
  assemblyName: string,
  metaPaths: string[],
): Promise<GenomeTarget> {
  let config: ConfigShape | undefined
  let metaUrl = ''
  for (const path of metaPaths) {
    metaUrl = hostedUrl(path)
    config = await fetchJson<ConfigShape>(metaUrl).catch(() => undefined)
    if (config) {
      break
    }
  }
  if (!config) {
    throw new Error(`No hosted config for ${assemblyName}`)
  }
  const aliases = await loadAliases(metaUrl, config)
  const trackIds = (config.tracks ?? []).map(t => t.trackId)
  return {
    configUrl,
    assemblyName,
    geneTrackId: pickGeneTrack(assemblyName, trackIds),
    variantTrackIds: pickVariantTracks(assemblyName, trackIds),
    canonicalRefName: refName => aliases?.get(refName) ?? refName,
  }
}

const targets = new Map<string, Promise<GenomeTarget>>()

// The genome an NCBI accession opens on. Memoized per accession: a session
// rebuild on every view-option toggle would otherwise re-read the config and the
// alias file. A failed load is evicted, so a later gene retries.
export function resolveGenomeTarget(accession: string): Promise<GenomeTarget> {
  let target = targets.get(accession)
  if (!target) {
    target = loadStore()
      .then(store => {
        const ucscDb = store.find(accession)?.ucscDb
        return ucscDb
          ? loadTarget(ucscConfigPath(ucscDb), ucscDb, [
              `/ucsc/${ucscDb}/minimal.json`,
              ucscConfigPath(ucscDb),
            ])
          : loadTarget(genarkConfigPath(accession), accession, [
              genarkConfigPath(accession),
            ])
      })
      .catch((e: unknown) => {
        targets.delete(accession)
        throw e
      })
    targets.set(accession, target)
  }
  return target
}
