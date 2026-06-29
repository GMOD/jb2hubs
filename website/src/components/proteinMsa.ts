// Assembles an ortholog protein alignment with conserved-domain annotations for
// react-msaview, entirely from NCBI data plus one EBI alignment step:
//   1. resolve the query gene -> its NCBI orthologs (one gene per species)
//   2. pick a representative protein per gene (MANE Select, else longest)
//   3. fetch protein sequences (efetch FASTA)
//   4. align them with EBI Clustal Omega -> column-locked FASTA + guide tree
//   5. fetch CDD conserved domains per protein (efetch GenPept Region features)
//   6. emit { fasta, newick, gff } — gff domains are per-row (seq_id = label) in
//      ungapped protein coordinates, which react-msaview projects onto columns.
// react-msaview does not align, so step 4 is unavoidable; NCBI has no clean
// alignment API, hence EBI. Sequences + domains stay on NCBI (already a site-wide
// dependency), so EBI is the only added external service.

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

export interface ProteinMsaResult {
  query: { symbol: string; refTaxonId: number }
  fasta: string
  newick: string
  gff: string
  rows: ProteinMsaRow[]
}

export interface ProteinMsaOptions {
  email?: string
  taxa?: number[] // species to include; defaults to the common-species set
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

export async function assembleProteinMsa(
  query: string,
  refTaxonId: number,
  { email = EBI_EMAIL, taxa, onProgress = () => undefined }: ProteinMsaOptions = {},
): Promise<ProteinMsaResult> {
  onProgress('Resolving orthologs across species…')
  const queryGeneId = await resolveGeneId(query, refTaxonId)
  if (!queryGeneId) {
    throw new Error(`no gene found for "${query}"`)
  }

  const wanted = new Set(taxa ?? COMMON_SPECIES.map(s => s.taxId))
  wanted.add(refTaxonId)
  // One ortholog per species, restricted to the wanted set, ordered by the
  // common-species rank (reference and close relatives first) so the alignment
  // is a readable, curated panel rather than hundreds of rows.
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
      `need at least two species with orthologs for an alignment (found ${genes.length})`,
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
  const rows: ProteinMsaRow[] = withProtein.map((g, i) => ({
    taxId: g.taxId,
    label: labels[i]!,
    scientificName: g.scientificName,
    commonName: g.commonName,
    geneId: g.geneId,
    protein: proteinByGene.get(g.geneId)!,
  }))
  if (rows.length < 2) {
    throw new Error('could not resolve representative proteins for the orthologs')
  }

  onProgress('Fetching protein sequences…')
  const accessions = rows.map(r => r.protein)
  const seqById = parseFasta(
    await ncbiText(
      `${EUTILS}/efetch.fcgi?db=protein&id=${accessions.join(',')}&rettype=fasta&retmode=text`,
    ),
  )
  onProgress(
    'Aligning proteins at EBI Clustal Omega and mapping NCBI conserved domains…',
  )
  const [{ aligned, newick }, domainsByAcc] = await Promise.all([
    clustalOmega(buildInputFasta(rows, seqById), { email }),
    ncbiText(
      `${EUTILS}/efetch.fcgi?db=protein&id=${accessions.join(',')}&rettype=gp&retmode=text`,
    ).then(parseAllDomains),
  ])

  return {
    query: { symbol: query, refTaxonId },
    fasta: unwrapFasta(aligned),
    newick,
    gff: buildDomainGff(rows, domainsByAcc),
    rows,
  }
}
