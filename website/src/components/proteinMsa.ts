// Assembles an ortholog protein comparison in two phases so the cheap view can
// render before the slow one:
//   Phase 1 — assembleProteinPanel (NCBI only, a few seconds):
//     1. resolve the query gene -> its NCBI orthologs (one gene per species)
//     2. pick a representative protein per gene (MANE Select, else longest)
//     3. fetch protein sequences (efetch FASTA) + CDD conserved domains
//        (efetch GenPept Region features)
//     -> rows carrying sequence, length and domains: enough to draw the
//        domain-architecture cartoon without aligning anything.
//   Phase 2 — alignProteinPanel (EBI Clustal Omega, up to minutes):
//     4. align the panel's sequences -> column-locked FASTA + guide tree
//     5. emit { fasta, newick, gff } — gff domains are per-row (seq_id = label)
//        in ungapped protein coordinates, which react-msaview projects onto
//        columns.
// react-msaview does not align, so phase 2 is unavoidable for the full viewer;
// NCBI has no clean alignment API, hence EBI. Splitting it out lets the UI show
// the cartoon immediately and only pay the EBI cost on demand.

import { EBI_EMAIL, clustalOmega } from './ebiAlign.ts'
import { DATASETS, EUTILS, ncbiJson, ncbiText } from './ncbiFetch.ts'
import { COMMON_SPECIES, COMMON_TAX_RANK } from './orthologSearchUtils.ts'
import { resolveGeneId } from './orthologSet.ts'

export interface ProteinMsaRow {
  taxId: number
  label: string // single-token id used in FASTA / tree / gff
  scientificName: string
  commonName?: string
  geneId: string
  protein: string // accession.version
}

// A panel row carries everything the domain cartoon needs without any alignment.
export interface ProteinPanelRow extends ProteinMsaRow {
  sequence: string // ungapped protein sequence
  length: number // residues
  domains: Domain[] // CDD conserved domains, ungapped protein coords
}

// Phase 1 output: the curated ortholog set with sequences + domains.
export interface ProteinPanel {
  query: { symbol: string; refTaxonId: number }
  rows: ProteinPanelRow[]
}

// Phase 2 output: a column-locked alignment + guide tree + per-row domain gff,
// ready to hand straight to react-msaview.
export interface ProteinAlignment {
  fasta: string
  newick: string
  gff: string
}

export interface ProteinPanelOptions {
  taxa?: number[] // species to include; defaults to the common-species set
  onProgress?: (message: string) => void
}

export interface ProteinAlignOptions {
  email?: string
  onProgress?: (message: string) => void // staged status for the slow EBI step
}

interface OrthologGene {
  taxId: number
  geneId: string
  scientificName: string
  commonName?: string
}

// One ortholog gene per species from the NCBI Datasets orthologs endpoint.
async function fetchOrthologGenes(geneId: string): Promise<OrthologGene[]> {
  const json = await ncbiJson<{
    reports?: {
      gene?: {
        gene_id?: string
        tax_id?: string | number
        taxname?: string
        common_name?: string
      }
    }[]
  }>(`${DATASETS}/gene/id/${geneId}/orthologs?returned_content=COMPLETE`)
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
async function fetchRepresentativeProteins(
  geneIds: string[],
): Promise<Map<string, string>> {
  const byGene = new Map<string, string>()
  if (geneIds.length > 0) {
    const json = await ncbiJson<{
      reports?: {
        product?: { gene_id?: string; transcripts?: ProductTranscript[] }
      }[]
    }>(`${DATASETS}/gene/id/${geneIds.join(',')}/product_report`)
    for (const { product } of json.reports ?? []) {
      const candidates = (product?.transcripts ?? [])
        .map(t => ({
          acc: t.protein?.accession_version,
          len: t.protein?.length ?? 0,
          mane: /select/i.test(t.select_category ?? ''),
        }))
        .filter((c): c is { acc: string; len: number; mane: boolean } => !!c.acc)
      const best =
        candidates.find(c => c.mane) ??
        [...candidates].sort((a, b) => b.len - a.len)[0]
      if (product?.gene_id && best) {
        byGene.set(product.gene_id, best.acc)
      }
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
    const block = record.slice(featStart, origin > featStart ? origin : undefined)
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

// accession.version -> its CDD domains, from a multi-record GenPept efetch.
function parseAllDomains(text: string): Map<string, Domain[]> {
  const byAcc = new Map<string, Domain[]>()
  for (const record of text.split(/\n\/\/\s*\n/)) {
    const ver = (/^VERSION\s+(\S+)/m.exec(record))?.[1]
    if (ver) {
      byAcc.set(ver, parseGenpeptDomains(record))
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
  return value.replace(/[;=\t\r\n]+/g, ' ').replace(/\s+/g, ' ').trim()
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

// Phase 1: resolve the ortholog panel and fetch sequences + domains from NCBI.
// Fast enough to drive the domain cartoon; no EBI alignment.
export async function assembleProteinPanel(
  query: string,
  refTaxonId: number,
  { taxa, onProgress = () => undefined }: ProteinPanelOptions = {},
): Promise<ProteinPanel> {
  onProgress('Resolving orthologs across species…')
  const queryGeneId = await resolveGeneId(query, refTaxonId)
  if (!queryGeneId) {
    throw new Error(`no gene found for "${query}"`)
  }

  const wanted = new Set(taxa ?? COMMON_SPECIES.map(s => s.taxId))
  wanted.add(refTaxonId)
  // One ortholog per species, restricted to the wanted set, ordered by the
  // common-species rank (reference and close relatives first) so the panel is a
  // readable, curated set rather than hundreds of rows.
  const byTaxon = new Map<number, OrthologGene>()
  for (const g of await fetchOrthologGenes(queryGeneId)) {
    if (wanted.has(g.taxId) && !byTaxon.has(g.taxId)) {
      byTaxon.set(g.taxId, g)
    }
  }
  const genes = [...byTaxon.values()].sort(
    (a, b) =>
      (COMMON_TAX_RANK.get(a.taxId) ?? Infinity) -
      (COMMON_TAX_RANK.get(b.taxId) ?? Infinity),
  )
  if (genes.length < 2) {
    throw new Error(
      `need at least two species with orthologs to compare (found ${genes.length})`,
    )
  }

  onProgress('Selecting a representative protein per species…')
  const proteinByGene = await fetchRepresentativeProteins(
    genes.map(g => g.geneId),
  )

  // Labels are shared across FASTA / tree / gff so the three line up.
  const withProtein = genes.filter(g => proteinByGene.has(g.geneId))
  const labels = dedupeLabels(
    withProtein.map(g => g.commonName ?? g.scientificName),
  )
  if (withProtein.length < 2) {
    throw new Error('could not resolve representative proteins for the orthologs')
  }

  onProgress('Fetching protein sequences and conserved domains…')
  const accessions = withProtein.map(g => proteinByGene.get(g.geneId)!)
  const [seqById, domainsByAcc] = await Promise.all([
    ncbiText(
      `${EUTILS}/efetch.fcgi?db=protein&id=${accessions.join(',')}&rettype=fasta&retmode=text`,
    ).then(parseFasta),
    ncbiText(
      `${EUTILS}/efetch.fcgi?db=protein&id=${accessions.join(',')}&rettype=gp&retmode=text`,
    ).then(parseAllDomains),
  ])

  const rows = withProtein
    .map((g, i) => {
      const protein = proteinByGene.get(g.geneId)!
      const sequence = seqById.get(protein) ?? ''
      return {
        taxId: g.taxId,
        label: labels[i]!,
        scientificName: g.scientificName,
        commonName: g.commonName,
        geneId: g.geneId,
        protein,
        sequence,
        length: sequence.length,
        domains: domainsByAcc.get(protein) ?? [],
      }
    })
    .filter(r => r.sequence)
  if (rows.length < 2) {
    throw new Error('could not fetch protein sequences for the orthologs')
  }

  return { query: { symbol: query, refTaxonId }, rows }
}

// Phase 2: align the panel's sequences at EBI Clustal Omega and emit the
// column-locked alignment, guide tree, and per-row domain gff for react-msaview.
export async function alignProteinPanel(
  panel: ProteinPanel,
  { email = EBI_EMAIL, onProgress = () => undefined }: ProteinAlignOptions = {},
): Promise<ProteinAlignment> {
  onProgress('Aligning proteins at EBI Clustal Omega…')
  const seqById = new Map(panel.rows.map(r => [r.protein, r.sequence]))
  const domainsByAcc = new Map(panel.rows.map(r => [r.protein, r.domains]))
  const { aligned, newick } = await clustalOmega(
    buildInputFasta(panel.rows, seqById),
    { email },
  )
  return {
    fasta: unwrapFasta(aligned),
    newick,
    gff: buildDomainGff(panel.rows, domainsByAcc),
  }
}
