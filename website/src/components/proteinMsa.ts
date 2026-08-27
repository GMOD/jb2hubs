// Assembles an ortholog protein comparison in two phases so the cheap view can
// render before the slow one:
//   Phase 1 — assembleProteinPanel (a few seconds):
//     1. resolve the query gene -> its orthologs, one per species, from NCBI or
//        from PANTHER where NCBI's vertebrate/insect sets cannot reach (see
//        OrthologSource below) — every species the source has, capped at
//        MAX_PANEL_ROWS
//     2. pick a representative protein per gene (MANE Select, else longest;
//        PANTHER's reference proteomes already carry one per gene)
//     3. fetch protein sequences + CDD conserved domains (efetch GenPept Region
//        features)
//     -> rows carrying sequence, length and domains: enough to draw the
//        domain-architecture cartoon without aligning anything.
//   Phase 2 — alignProteinPanel (EBI Clustal Omega, up to minutes):
//     4. align the panel's first MAX_ALIGN_ROWS rows -> column-locked FASTA +
//        guide tree
//     5. emit { fasta, newick, gff } — gff domains are per-row (seq_id = label)
//        in ungapped protein coordinates, which react-msaview projects onto
//        columns.
// react-msaview does not align, so phase 2 is unavoidable for the full viewer;
// NCBI has no clean alignment API, hence EBI. Splitting it out lets the UI show
// the cartoon immediately and only pay the EBI cost on demand.

import { EBI_EMAIL, clustalOmega } from './ebiAlign.ts'
import {
  DATASETS,
  EUTILS,
  fetchOrthologReports,
  ncbiJson,
  ncbiText,
} from './ncbiFetch.ts'
import { COMMON_TAX_RANK } from './orthologSearchUtils.ts'
import { resolveGeneId } from './orthologSet.ts'
import { fetchGenomes, fetchPantherOrthologs } from './pantherOrthologs.ts'

export interface ProteinMsaRow {
  taxId: number
  label: string // single-token id used in FASTA / tree / gff
  scientificName: string
  commonName?: string
  // NCBI GeneID, absent on PANTHER rows — it keys nothing downstream, and
  // PANTHER identifies a gene by its UniProt accession instead
  geneId?: string
  protein: string // accession.version (NCBI) or UniProt accession (PANTHER)
}

// A panel row carries everything the domain cartoon needs without any alignment.
// `sequence` is the one thing the cartoon does NOT need — `length` is stored
// beside it — and it is 71% of the precomputed cache's bytes, so a cache entry
// that ships its alignment drops it (see stripSequences). A live panel always
// has it. Nothing but alignProteinPanel reads it.
export interface ProteinPanelRow extends ProteinMsaRow {
  sequence?: string // ungapped protein sequence
  length: number // residues
  domains: Domain[] // CDD conserved domains, ungapped protein coords
}

// Phase 1 output: the ortholog set with sequences + domains. `total` is how many
// species the source had before the row cap, so the page can say what it left
// out; it is absent on a panel built before the field existed.
export interface ProteinPanel {
  query: {
    symbol: string
    refTaxonId: number
    source: OrthologSource
    total?: number
  }
  rows: ProteinPanelRow[]
}

// Where the ortholog set comes from. NCBI's sets are vertebrate- and
// insect-scoped, so a reference gene outside that span finds nothing to compare
// against — measured 2026-08-25, yeast CDC28 returns three orthologs, all yeast.
// PANTHER's 144 reference proteomes cover every species this page offers. See
// pantherOrthologs.ts for the measurements behind the pick.
export type OrthologSource = 'ncbi' | 'panther'

// Reference species whose orthologs NCBI cannot supply across this panel.
// Drosophila is in the list despite being an insect: NCBI finds it 108
// orthologs and every one is another insect, so the panel would be fly alone.
const PANTHER_ONLY_TAXA = new Set([
  7227, // Drosophila melanogaster
  6239, // Caenorhabditis elegans
  559292, // Saccharomyces cerevisiae S288C
  3702, // Arabidopsis thaliana
])

export function defaultOrthologSource(taxId: number): OrthologSource {
  return PANTHER_ONLY_TAXA.has(taxId) ? 'panther' : 'ncbi'
}

// Phase 2 output: a column-locked alignment + guide tree + per-row domain gff,
// ready to hand straight to react-msaview.
export interface ProteinAlignment {
  fasta: string
  newick: string
  gff: string
}

// How many species a panel carries when the caller names no set. Breadth is what
// the domain cartoon is for and it costs nothing to ask for — the request count
// is the same either way, and NCBI's ortholog report already comes back
// model-organism-first and broadening outward, so the first 60 need no
// phylogenetic sampling. Measured 2026-08-27 across 18 genes on 9 reference
// species: filtering to the 13 COMMON_SPECIES resolved 7-9 rows every single
// time (no vertebrate gene has a fly, worm, yeast AND plant ortholog in NCBI's
// set), while the same call unfiltered resolved 60 — MYC in 2.3s against the
// curated set's 3.2s.
export const MAX_PANEL_ROWS = 60

// How many of those rows the EBI alignment gets, which is deliberately fewer.
// The cartoon improves with breadth; the residue alignment does not, and Clustal
// Omega's cost climbs with row count and protein length together. Measured
// 2026-08-27 on the eight example panels at 60 rows: SOD1 and TP53 finish in
// 10s, EGFR and COL1A1 and PAX6 in ~30s, NOTCH1 in 81s, DMD in 146s — and BRCA2
// takes 209s and 211s on two runs, past clustalOmega's 180s deadline both times,
// so the shipped BRCA2 chip's own alignment button was failing. The same panels
// cut to 24 rows: BRCA2 63s, DMD 90s, NOTCH1 45s. Rows are ranked
// model-organism-first before the cut, so 24 keeps every model organism the
// panel found plus the next dozen.
export const MAX_ALIGN_ROWS = 24

export interface ProteinPanelOptions {
  taxa?: number[] // species to include; defaults to every species the source has
  maxRows?: number // defaults to MAX_PANEL_ROWS
  source?: OrthologSource // defaults per reference species
  onProgress?: (message: string) => void
  // An already-resolved NCBI GeneID for the query, which skips the symbol
  // lookup. A caller that resolved the gene for something else (the browser
  // resolves it for the genome view) would otherwise pay the identical
  // `gene/symbol/<sym>/taxon/<tax>` request a second time, and ncbiFetch
  // serializes every call — so the duplicate costs a whole rate-limit slot.
  // Ignored by the PANTHER source, which resolves on the symbol.
  geneId?: string
}

export interface ProteinAlignOptions {
  email?: string
  maxRows?: number // defaults to MAX_ALIGN_ROWS
  onProgress?: (message: string) => void // staged status for the slow EBI step
}

// The first `max` of the source's own order, with the reference species kept
// whatever its position — a panel that dropped the gene being compared against
// is not a comparison. Both sources put it near the front (measured 2026-08-27,
// index 0-10 of several hundred for every reference species the page offers), so
// this is a guard rather than a reordering.
export function capRows<T extends { taxId: number }>(
  rows: T[],
  refTaxonId: number,
  max: number,
): T[] {
  if (rows.length <= max) {
    return rows
  }
  const kept = rows.slice(0, max)
  if (kept.some(r => r.taxId === refTaxonId)) {
    return kept
  }
  const ref = rows.find(r => r.taxId === refTaxonId)
  return ref ? [ref, ...kept.slice(0, max - 1)] : kept
}

interface OrthologGene {
  taxId: number
  geneId: string
  scientificName: string
  commonName?: string
}

// One ortholog gene per species from the NCBI Datasets orthologs endpoint.
async function fetchOrthologGenes(geneId: string): Promise<OrthologGene[]> {
  const json = await fetchOrthologReports<{
    reports?: {
      gene?: {
        gene_id?: string
        tax_id?: string | number
        taxname?: string
        common_name?: string
      }
    }[]
  }>(geneId)
  const genes: OrthologGene[] = []
  for (const { gene } of json.reports ?? []) {
    const taxId = Number(gene?.tax_id)
    if (gene?.gene_id && Number.isFinite(taxId)) {
      genes.push({
        taxId,
        geneId: gene.gene_id,
        scientificName: gene.taxname ?? String(taxId),
        commonName: gene.common_name,
      })
    }
  }
  return genes
}

interface ProductTranscript {
  select_category?: string
  protein?: { accession_version?: string; length?: number }
}

// Representative protein per gene: MANE Select where flagged, else the longest
// protein isoform (a stable, comparable choice across species).
// product_report paginates: it returns 20 reports a page by default and hands
// back a next_page_token. Reading `reports` from one response therefore caps the
// panel at 20 species however many gene ids go in — invisible while the panel
// was the 13 COMMON_SPECIES, and a silent truncation the moment it is not.
// Measured 2026-08-26 on 60 TP53 orthologs: one call returns 20, page_size=100
// returns all 60, and the token walks the rest.
const PRODUCT_PAGE_SIZE = 100
const MAX_PRODUCT_PAGES = 50

async function fetchRepresentativeProteins(
  geneIds: string[],
): Promise<Map<string, string>> {
  const byGene = new Map<string, string>()
  let pageToken: string | undefined
  for (let page = 0; geneIds.length > 0 && page < MAX_PRODUCT_PAGES; page++) {
    const json = await ncbiJson<{
      reports?: {
        product?: { gene_id?: string; transcripts?: ProductTranscript[] }
      }[]
      next_page_token?: string
    }>(
      `${DATASETS}/gene/id/${geneIds.join(',')}/product_report?page_size=${PRODUCT_PAGE_SIZE}${
        pageToken ? `&page_token=${encodeURIComponent(pageToken)}` : ''
      }`,
    )
    for (const { product } of json.reports ?? []) {
      const candidates = (product?.transcripts ?? [])
        .map(t => ({
          acc: t.protein?.accession_version,
          len: t.protein?.length ?? 0,
          mane: /select/i.test(t.select_category ?? ''),
        }))
        .filter(
          (c): c is { acc: string; len: number; mane: boolean } => !!c.acc,
        )
      const best =
        candidates.find(c => c.mane) ??
        candidates.sort((a, b) => b.len - a.len)[0]
      if (product?.gene_id && best) {
        byGene.set(product.gene_id, best.acc)
      }
    }
    pageToken = json.next_page_token
    if (!pageToken) {
      break
    }
  }
  return byGene
}

// accession (first header token) -> ungapped sequence, from an efetch multi-FASTA.
export function parseFasta(text: string): Map<string, string> {
  const map = new Map<string, string>()
  let acc: string | undefined
  let buf: string[] = []
  for (const line of text.split('\n')) {
    if (line.startsWith('>')) {
      if (acc) {
        map.set(acc, buf.join(''))
      }
      acc = line.slice(1).split(/\s+/)[0]
      buf = []
    } else {
      buf.push(line.trim())
    }
  }
  if (acc) {
    map.set(acc, buf.join(''))
  }
  return map
}

export interface Domain {
  start: number
  end: number
  name: string
}

// CDD conserved domains from one GenPept record's FEATURES table: Region
// features carrying a CDD db_xref (the conserved domains, as opposed to curated
// interaction "site" regions). Coordinates are 1-based ungapped protein.
export function parseGenpeptDomains(record: string): Domain[] {
  const featStart = record.indexOf('\nFEATURES')
  const origin = record.indexOf('\nORIGIN')
  const out: Domain[] = []
  if (featStart >= 0) {
    const block = record.slice(
      featStart,
      origin > featStart ? origin : undefined,
    )
    let cur: { start: number; end: number; name: string; cdd: boolean } | null =
      null
    let openName = false
    const flush = () => {
      if (cur?.cdd && cur.name) {
        out.push({
          start: cur.start,
          end: cur.end,
          name: cur.name.replace(/\s+/g, ' ').trim(),
        })
      }
      cur = null
      openName = false
    }
    for (const line of block.split('\n')) {
      if (/^ {5}\S/.test(line)) {
        flush()
        const m = /^ {5}Region {2,}<?(\d+)\.\.>?(\d+)/.exec(line)
        cur = m
          ? { start: Number(m[1]), end: Number(m[2]), name: '', cdd: false }
          : null
      } else if (cur && /^ {21}\//.test(line)) {
        openName = false
        const rn = /^ {21}\/region_name="?([^"]*)"?/.exec(line)
        if (rn?.[1] !== undefined) {
          cur.name = rn[1]
          openName = line.includes('"') && !/"\s*$/.test(line)
        }
        if (/^ {21}\/db_xref="CDD:/.test(line)) {
          cur.cdd = true
        }
      } else if (cur && openName && /^ {21}/.test(line)) {
        cur.name += ` ${line.trim().replace(/"$/, '')}`
        openName = !/"\s*$/.test(line)
      }
    }
    flush()
  }
  return out
}

// accession -> its CDD domains, from a multi-record GenPept efetch, keyed BOTH
// versioned and bare. efetch answers with the version it holds — ask for
// `P00546` and the record says `VERSION P00546.1` — while the accession a row
// carries depends on where it came from: NCBI's product report gives a versioned
// RefSeq (`NP_009718.3`), PANTHER gives a bare UniProt (`P00546`). Keying only
// on what the record says silently dropped every domain on the PANTHER rows,
// which reads as "these orthologs have no conserved domains" rather than as a
// lookup miss.
export function parseAllDomains(text: string): Map<string, Domain[]> {
  const byAcc = new Map<string, Domain[]>()
  for (const record of text.split(/\n\/\/\s*\n/)) {
    const ver = /^VERSION\s+(\S+)/m.exec(record)?.[1]
    if (ver) {
      const domains = parseGenpeptDomains(record)
      const bare = ver.replace(/\.\d+$/, '')
      // The exact key is unambiguous and always wins. The bare key is shared —
      // two records can reduce to it — so first claim holds, which keeps a later
      // record from silently answering an earlier one's lookup.
      if (ver !== bare) {
        byAcc.set(ver, domains)
      }
      if (!byAcc.has(bare)) {
        byAcc.set(bare, domains)
      }
    }
  }
  return byAcc
}

function sanitize(name: string) {
  return name.replace(/[^A-Za-z0-9]+/g, '_').replace(/^_+|_+$/g, '')
}

// Sanitized, unique single-token labels, used identically in the FASTA headers,
// the tree leaf names, and the gff seq_ids so all three line up. Collisions
// (e.g. two rows sanitizing to the same name) get a numeric suffix.
export function dedupeLabels(names: string[]): string[] {
  const seen = new Map<string, number>()
  return names.map(name => {
    const base = sanitize(name)
    const n = seen.get(base) ?? 0
    seen.set(base, n + 1)
    return n === 0 ? base : `${base}_${n + 1}`
  })
}

// EBI returns FASTA wrapped at 60 columns; collapse each record to a single
// sequence line so the viewer's parser sees the alignment unambiguously.
export function unwrapFasta(text: string): string {
  const records: string[] = []
  let header: string | undefined
  let buf: string[] = []
  for (const line of text.split('\n')) {
    if (line.startsWith('>')) {
      if (header) {
        records.push(`${header}\n${buf.join('')}`)
      }
      header = line.trim()
      buf = []
    } else {
      buf.push(line.trim())
    }
  }
  if (header) {
    records.push(`${header}\n${buf.join('')}`)
  }
  return records.join('\n')
}

// GFF attribute values must not contain the structural chars ; = tab; collapse
// any whitespace they leave behind so names stay tidy.
function gffSafe(value: string) {
  return value
    .replace(/[;=\t\r\n]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

// What the FASTA/GFF builders need from a row — kept narrow so they're trivially
// testable without constructing a full ProteinMsaRow.
interface LabelledProtein {
  label: string
  protein: string
}

// FASTA submitted to the aligner: our row labels as headers (so they propagate
// to the aligned output + tree); rows with a missing sequence are dropped.
export function buildInputFasta(
  rows: LabelledProtein[],
  seqById: Map<string, string>,
): string {
  return rows
    .map(r => {
      const seq = seqById.get(r.protein)
      return seq ? `>${r.label}\n${seq}` : ''
    })
    .filter(Boolean)
    .join('\n')
}

// Per-row domain track: each protein's CDD domains as protein_match features in
// ungapped protein coordinates, keyed by the row label (= its alignment row).
export function buildDomainGff(
  rows: LabelledProtein[],
  domainsByAcc: Map<string, Domain[]>,
): string {
  const lines = ['##gff-version 3']
  for (const r of rows) {
    for (const d of domainsByAcc.get(r.protein) ?? []) {
      const name = gffSafe(d.name)
      lines.push(
        `${r.label}\tNCBI\tprotein_match\t${d.start}\t${d.end}\t.\t.\t.\tName=${name};description=${name}`,
      )
    }
  }
  return lines.join('\n')
}

// What both ortholog sources reduce to before the shared tail (labels, domains,
// row assembly) runs. `protein` is whatever accession the sequence came under,
// which is also the accession CDD domains are fetched by.
interface SourcedProtein {
  taxId: number
  scientificName: string
  commonName?: string
  geneId?: string
  protein: string
  sequence: string
}

// …plus how many species the source knew of before the cap, which the page shows
// so a capped panel says what it left out rather than reading as the whole set.
interface Sourced {
  proteins: SourcedProtein[]
  total: number
}

// NCBI: orthologs by GeneID, a representative protein per gene, then one efetch
// for the sequences. The row cap is applied here rather than after, because
// every later call carries one id per gene: TP53's full set of 658 would be
// seven pages of product_report and a GenPept efetch of 658 flatfiles, which on
// a titin-sized protein is hundreds of megabytes to reach 60 drawn rows.
async function ncbiProteins(
  query: string,
  refTaxonId: number,
  wanted: Set<number> | undefined,
  maxRows: number,
  onProgress: (message: string) => void,
  resolvedGeneId?: string,
): Promise<Sourced> {
  onProgress('Resolving orthologs across species…')
  const queryGeneId = resolvedGeneId ?? (await resolveGeneId(query, refTaxonId))
  if (!queryGeneId) {
    throw new Error(`no gene found for "${query}"`)
  }
  // One ortholog per species, in the report's own order.
  const orthologs = await fetchOrthologGenes(queryGeneId)
  const total = new Set(orthologs.map(g => g.taxId)).size
  const byTaxon = new Map<number, OrthologGene>()
  for (const g of orthologs) {
    if ((!wanted || wanted.has(g.taxId)) && !byTaxon.has(g.taxId)) {
      byTaxon.set(g.taxId, g)
    }
  }
  const genes = capRows([...byTaxon.values()], refTaxonId, maxRows)
  if (genes.length < 2) {
    throw new Error(
      `need at least two species with orthologs to compare (found ${genes.length})`,
    )
  }

  onProgress('Selecting a representative protein per species…')
  const proteinByGene = await fetchRepresentativeProteins(
    genes.map(g => g.geneId),
  )
  const withProtein = genes.filter(g => proteinByGene.has(g.geneId))
  if (withProtein.length < 2) {
    throw new Error(
      'could not resolve representative proteins for the orthologs',
    )
  }

  onProgress('Fetching protein sequences…')
  const accessions = withProtein.map(g => proteinByGene.get(g.geneId)!)
  const seqById = await ncbiText(
    `${EUTILS}/efetch.fcgi?db=protein&id=${accessions.join(',')}&rettype=fasta&retmode=text`,
  ).then(parseFasta)

  const proteins = withProtein.flatMap(g => {
    const protein = proteinByGene.get(g.geneId)!
    const sequence = seqById.get(protein)
    return sequence
      ? [
          {
            taxId: g.taxId,
            scientificName: g.scientificName,
            commonName: g.commonName,
            geneId: g.geneId,
            protein,
            sequence,
          },
        ]
      : []
  })
  return { proteins, total }
}

// PANTHER: one call maps the gene to a UniProt accession per target proteome and
// a second returns the sequences, so there is no per-gene isoform pick to make —
// a reference proteome has one protein per gene by construction.
// Naming no set means every reference proteome PANTHER has, which is the broad
// answer here — 144 genomes spanning the kingdoms, against the 13 the page's
// species menu offers. The cap comes after the call rather than before it: the
// cost is one matchortho and one UniProt read whatever the target list, so
// asking for all of them and keeping the first 60 is cheaper than choosing
// first. The target list is ranked model-organism-first, since PANTHER answers
// in that order and the cap takes the head of it.
async function pantherProteins(
  query: string,
  refTaxonId: number,
  wanted: Set<number> | undefined,
  maxRows: number,
  onProgress: (message: string) => void,
): Promise<Sourced> {
  onProgress('Resolving orthologs at PANTHER…')
  const taxa = wanted
    ? [...wanted]
    : (await fetchGenomes()).map(g => g.taxId).sort(byCommonRank)
  const rows = await fetchPantherOrthologs({
    symbol: query,
    taxId: refTaxonId,
    taxa,
  })
  if (rows.length < 2) {
    throw new Error(
      `need at least two species with orthologs to compare (found ${rows.length})`,
    )
  }
  return {
    total: rows.length,
    proteins: capRows(rows, refTaxonId, maxRows).map(r => ({
      taxId: r.taxId,
      scientificName: r.scientificName,
      commonName: r.commonName,
      protein: r.accession,
      sequence: r.sequence,
    })),
  }
}

// Phase 1: resolve the ortholog panel and fetch its sequences + domains. Fast
// enough to drive the domain cartoon; no EBI alignment.
export async function assembleProteinPanel(
  query: string,
  refTaxonId: number,
  {
    taxa,
    maxRows = MAX_PANEL_ROWS,
    source = defaultOrthologSource(refTaxonId),
    onProgress = () => undefined,
    geneId,
  }: ProteinPanelOptions = {},
): Promise<ProteinPanel> {
  // No `taxa` asks the source for everything it has; naming one still scopes the
  // panel to it, and the reference species is in either way.
  const wanted = taxa ? new Set([...taxa, refTaxonId]) : undefined
  const { proteins, total } = await (source === 'panther'
    ? pantherProteins(query, refTaxonId, wanted, maxRows, onProgress)
    : ncbiProteins(query, refTaxonId, wanted, maxRows, onProgress, geneId))

  // Ordered by the common-species rank (reference and close relatives first) so
  // the panel reads as a curated set rather than whatever order a source used.
  // It is also what makes the alignment's own cap meaningful, since that takes
  // the head of this list.
  const ordered = [...proteins].sort((a, b) => byCommonRank(a.taxId, b.taxId))
  // Labels are shared across FASTA / tree / gff so the three line up.
  const labels = dedupeLabels(
    ordered.map(p => p.commonName ?? p.scientificName),
  )

  onProgress('Fetching conserved domains…')
  const domainsByAcc = await fetchDomains(ordered.map(p => p.protein))

  const rows = ordered.map((p, i) => ({
    ...p,
    label: labels[i]!,
    length: p.sequence.length,
    domains: domainsByAcc.get(p.protein) ?? [],
  }))
  if (rows.length < 2) {
    throw new Error('could not fetch protein sequences for the orthologs')
  }

  return { query: { symbol: query, refTaxonId, source, total }, rows }
}

// Model organisms first, then whatever order the source used. Species outside
// COMMON_SPECIES all rank Infinity, so a stable sort leaves them as they came.
function byCommonRank(a: number, b: number) {
  return (
    (COMMON_TAX_RANK.get(a) ?? Infinity) - (COMMON_TAX_RANK.get(b) ?? Infinity)
  )
}

// CDD domains for a batch of accessions, best-effort: they decorate the cartoon
// and the alignment, and a panel without them still answers the main question.
// efetch serves a Swiss-Prot accession as a GenPept record with CDD Regions just
// as it serves a RefSeq one, and answers a TrEMBL accession with HTTP 400 — a
// mixed batch returns what it can, so PANTHER rows get domains wherever the
// accession is reviewed, and an all-TrEMBL batch costs the domains, not the run.
async function fetchDomains(accessions: string[]) {
  return ncbiText(
    `${EUTILS}/efetch.fcgi?db=protein&id=${accessions.join(',')}&rettype=gp&retmode=text`,
  )
    .then(parseAllDomains)
    .catch(() => new Map<string, Domain[]>())
}

// Which of a panel's rows the alignment covers — the head of the panel's own
// model-organism-first order. Exported so the page can say how many before the
// job runs rather than after.
export function alignedRows(panel: ProteinPanel, maxRows = MAX_ALIGN_ROWS) {
  return capRows(panel.rows, panel.query.refTaxonId, maxRows)
}

// Whether a panel still carries the sequences an alignment would need. A live
// panel always does; a cache entry that shipped its alignment does not, and
// asking EBI to align nothing would come back as an unreadable submission error
// rather than as the missing precondition it is.
export function canAlign(panel: ProteinPanel) {
  return panel.rows.filter(r => r.sequence).length >= 2
}

// Drops what only the aligner reads, for a cache entry whose alignment is
// already computed. The cartoon renders from `length` and `domains`, so this is
// invisible on the page and 71% of the file: measured 2026-08-27 over the eight
// example genes, 1,071 KB raw / 139 KB brotli becomes 307 KB / 23 KB.
export function stripSequences(panel: ProteinPanel): ProteinPanel {
  return {
    ...panel,
    rows: panel.rows.map(({ sequence: _drop, ...row }) => row),
  }
}

// Phase 2: align the panel's sequences at EBI Clustal Omega and emit the
// column-locked alignment, guide tree, and per-row domain gff for react-msaview.
export async function alignProteinPanel(
  panel: ProteinPanel,
  {
    email = EBI_EMAIL,
    maxRows = MAX_ALIGN_ROWS,
    onProgress = () => undefined,
  }: ProteinAlignOptions = {},
): Promise<ProteinAlignment> {
  if (!canAlign(panel)) {
    throw new Error('this panel carries no protein sequences to align')
  }
  // The gff comes off the same rows as the fasta: react-msaview keys domains to
  // alignment rows by label, so a domain for a row that was not aligned has
  // nothing to land on.
  const rows = alignedRows(panel, maxRows)
  onProgress(`Aligning ${rows.length} proteins at EBI Clustal Omega…`)
  const seqById = new Map(
    rows.flatMap(r => (r.sequence ? [[r.protein, r.sequence] as const] : [])),
  )
  const domainsByAcc = new Map(rows.map(r => [r.protein, r.domains]))
  const { aligned, newick } = await clustalOmega(
    buildInputFasta(rows, seqById),
    { email },
  )
  return {
    fasta: unwrapFasta(aligned),
    newick,
    gff: buildDomainGff(rows, domainsByAcc),
  }
}
