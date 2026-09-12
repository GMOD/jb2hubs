// A domain's own alignment: the Pfam seed for the family, with the query's
// translation placed in it as the row the genome view is linked to.
//
// A seed is the curated, non-redundant set of sequences a Pfam family's HMM was
// built from — a few dozen representatives spanning the family's whole
// taxonomic reach, hand-aligned. It is the narrow, deliberate database that a
// search of everything is not: it answers "what does this domain look like
// across life, and which residues define it" in one read, with no job. InterPro
// serves it per family (gzipped Stockholm, 4–15 KB, cross-origin), and the tree
// Pfam distributes for it is hosted beside the msafam demo.
//
// The seed does not contain the query, so the query has to be put in. Every
// seed row is a domain segment; the query is aligned locally against each row's
// ungapped segment (Smith-Waterman, BLOSUM62, affine gaps — a few million cells,
// milliseconds) and projected through the best-scoring one onto the seed's
// columns: a query residue aligned to a row residue takes that residue's column,
// a query residue the row lacks opens a new column every other row gaps. The
// query row is the aligned segment alone, Pfam-style (`TP53/99-289`), and
// `domain` says which residues of the translation it is — the caller trims the
// session's connected transcript to those codons (sliceCds), so the msaview
// plugin maps the row's residues to the genome exactly and nothing else.
//
// The first version carried the whole translation as the query row, flanks as
// columns of gaps in every other row. Measured 2026-09-11 on NOTCH1's EGF
// domain: 67 seed rows of 50 columns became 67 rows of 2,600, 174 KB, and the
// 50 KB the msaview plugin's snapshot will carry kept 16 of them. The segment
// is 4 KB and keeps all 67.
//
// When the query protein is itself a seed member (P53_HUMAN is in PF00870), its
// row is replaced rather than duplicated, and the tree leaf is renamed to it.

import { fetchText } from '../lib/fetchJson.ts'

const INTERPRO_WWW = 'https://www.ebi.ac.uk/interpro/wwwapi'
const PFAM_TREES = 'https://jbrowse.org/demos/pfam/trees'

export interface SeedRow {
  name: string // Pfam style: ID_SPECIES/start-end
  aligned: string // gap characters normalised to '-', residues upper-cased
  accession?: string // #=GS AC, version stripped
}

export interface StockholmAlignment {
  id?: string // #=GF ID
  accession?: string // #=GF AC
  description?: string // #=GF DE
  rows: SeedRow[]
}

const bareAccession = (acc: string) => acc.replace(/\.\d+$/, '')

// One alignment out of a Stockholm file: rows in first-seen order, blocks
// concatenated, per-row accessions off the #=GS lines. Everything else the
// format carries (#=GC consensus lines, #=GR per-residue marks) is dropped.
export function parseStockholm(text: string): StockholmAlignment {
  const rows = new Map<string, SeedRow>()
  const out: StockholmAlignment = { rows: [] }
  for (const raw of text.split('\n')) {
    const line = raw.trimEnd()
    if (line === '//') {
      break
    }
    if (line.startsWith('#=GF ')) {
      const m = /^#=GF (\w+)\s+(.*)$/.exec(line)
      if (m?.[1] === 'ID') {
        out.id = m[2]
      } else if (m?.[1] === 'AC') {
        out.accession = m[2]
      } else if (m?.[1] === 'DE') {
        out.description = m[2]
      }
    } else if (line.startsWith('#=GS ')) {
      const m = /^#=GS (\S+)\s+AC\s+(\S+)/.exec(line)
      if (m) {
        const row = rows.get(m[1]!) ?? { name: m[1]!, aligned: '' }
        row.accession = bareAccession(m[2]!)
        rows.set(m[1]!, row)
      }
    } else if (line && !line.startsWith('#')) {
      const m = /^(\S+)\s+(\S+)$/.exec(line)
      if (m) {
        const row = rows.get(m[1]!) ?? { name: m[1]!, aligned: '' }
        row.aligned += m[2]!.replaceAll('.', '-').toUpperCase()
        rows.set(m[1]!, row)
      }
    }
  }
  out.rows = [...rows.values()].filter(r => r.aligned)
  return out
}

// InterPro serves the file gzipped with a content-encoding header, which fetch
// undoes on the way in; the browser sees Stockholm text.
export async function fetchPfamSeed(pfam: string): Promise<StockholmAlignment> {
  const text = await fetchText(
    `${INTERPRO_WWW}/entry/pfam/${encodeURIComponent(pfam)}/?annotation=alignment:seed`,
  )
  const seed = parseStockholm(text)
  if (seed.rows.length < 2) {
    throw new Error(`Pfam ${pfam} has no seed alignment to read`)
  }
  return seed
}

// Best-effort: the tree is a nicety. Its leaves are named exactly as the seed's
// rows, which is what lets the query be grafted in beside its anchor.
export async function fetchPfamTree(pfam: string): Promise<string | undefined> {
  return fetchText(`${PFAM_TREES}/${encodeURIComponent(pfam)}.tree`).catch(
    () => undefined,
  )
}

// --- scoring -----------------------------------------------------------------

const AMINO = 'ARNDCQEGHILKMFPSTWYV'
const BLOSUM62 = [
  [4, -1, -2, -2, 0, -1, -1, 0, -2, -1, -1, -1, -1, -2, -1, 1, 0, -3, -2, 0],
  [-1, 5, 0, -2, -3, 1, 0, -2, 0, -3, -2, 2, -1, -3, -2, -1, -1, -3, -2, -3],
  [-2, 0, 6, 1, -3, 0, 0, 0, 1, -3, -3, 0, -2, -3, -2, 1, 0, -4, -2, -3],
  [-2, -2, 1, 6, -3, 0, 2, -1, -1, -3, -4, -1, -3, -3, -1, 0, -1, -4, -3, -3],
  [
    0, -3, -3, -3, 9, -3, -4, -3, -3, -1, -1, -3, -1, -2, -3, -1, -1, -2, -2,
    -1,
  ],
  [-1, 1, 0, 0, -3, 5, 2, -2, 0, -3, -2, 1, 0, -3, -1, 0, -1, -2, -1, -2],
  [-1, 0, 0, 2, -4, 2, 5, -2, 0, -3, -3, 1, -2, -3, -1, 0, -1, -3, -2, -2],
  [0, -2, 0, -1, -3, -2, -2, 6, -2, -4, -4, -2, -3, -3, -2, 0, -2, -2, -3, -3],
  [-2, 0, 1, -1, -3, 0, 0, -2, 8, -3, -3, -1, -2, -1, -2, -1, -2, -2, 2, -3],
  [-1, -3, -3, -3, -1, -3, -3, -4, -3, 4, 2, -3, 1, 0, -3, -2, -1, -3, -1, 3],
  [-1, -2, -3, -4, -1, -2, -3, -4, -3, 2, 4, -2, 2, 0, -3, -2, -1, -2, -1, 1],
  [-1, 2, 0, -1, -3, 1, 1, -2, -1, -3, -2, 5, -1, -3, -1, 0, -1, -3, -2, -2],
  [-1, -1, -2, -3, -1, 0, -2, -3, -2, 1, 2, -1, 5, 0, -2, -1, -1, -1, -1, 1],
  [-2, -3, -3, -3, -2, -3, -3, -3, -1, 0, 0, -3, 0, 6, -4, -2, -2, 1, 3, -1],
  [
    -1, -2, -2, -1, -3, -1, -1, -2, -2, -3, -3, -1, -2, -4, 7, -1, -1, -4, -3,
    -2,
  ],
  [1, -1, 1, 0, -1, 0, 0, 0, -1, -2, -2, 0, -1, -2, -1, 4, 1, -3, -2, -2],
  [0, -1, 0, -1, -1, -1, -1, -2, -2, -1, -1, -1, -1, -2, -1, 1, 5, -2, -2, 0],
  [
    -3, -3, -4, -4, -2, -2, -3, -2, -2, -3, -2, -3, -1, 1, -4, -3, -2, 11, 2,
    -3,
  ],
  [-2, -2, -2, -3, -2, -1, -2, -3, 2, -1, -1, -2, -1, 3, -3, -2, -2, 2, 7, -1],
  [0, -3, -3, -3, -1, -2, -2, -3, -3, 3, 1, -2, 1, -1, -2, -2, 0, -3, -1, 4],
]
const INDEX = new Map(Array.from(AMINO, (a, i) => [a, i]))
const UNKNOWN = -1
const GAP_OPEN = 11
const GAP_EXTEND = 1

function score(a: string, b: string) {
  const i = INDEX.get(a)
  const j = INDEX.get(b)
  return i === undefined || j === undefined ? UNKNOWN : BLOSUM62[i]![j]!
}

export interface LocalAlignment {
  score: number
  // aligned residue pairs [queryIndex, targetIndex], both 0-based and strictly
  // increasing — a jump in either is a gap in the other
  pairs: [number, number][]
}

// Smith-Waterman with affine gaps (Gotoh), traceback from the best cell. Local,
// because a seed row is one domain and the query is a whole protein.
export function localAlign(query: string, target: string): LocalAlignment {
  const n = query.length
  const m = target.length
  const w = m + 1
  // H: best ending in a match; E: gap in query (consumes target); F: gap in
  // target (consumes query). Traceback: 0 stop, 1 diagonal, 2 from E, 3 from F.
  const H = new Int32Array((n + 1) * w)
  const E = new Int32Array((n + 1) * w)
  const F = new Int32Array((n + 1) * w)
  const from = new Uint8Array((n + 1) * w)
  let best = 0
  let bi = 0
  let bj = 0
  for (let i = 1; i <= n; i++) {
    const qi = query[i - 1]!
    for (let j = 1; j <= m; j++) {
      const k = i * w + j
      const e = Math.max(H[k - 1]! - GAP_OPEN, E[k - 1]! - GAP_EXTEND)
      const f = Math.max(H[k - w]! - GAP_OPEN, F[k - w]! - GAP_EXTEND)
      const d = H[k - w - 1]! + score(qi, target[j - 1]!)
      E[k] = e
      F[k] = f
      let h = 0
      let src = 0
      if (d > h) {
        h = d
        src = 1
      }
      if (e > h) {
        h = e
        src = 2
      }
      if (f > h) {
        h = f
        src = 3
      }
      H[k] = h
      from[k] = src
      if (h > best) {
        best = h
        bi = i
        bj = j
      }
    }
  }
  const pairs: [number, number][] = []
  let i = bi
  let j = bj
  // Walk back: a gap state may have been entered by an open (from H) or an
  // extend (from itself), decided by re-deriving which term won.
  let state = from[i * w + j]
  while (i > 0 && j > 0 && state !== 0) {
    const k = i * w + j
    if (state === 1) {
      pairs.push([i - 1, j - 1])
      i--
      j--
      state = from[i * w + j]
    } else if (state === 2) {
      const opened = E[k] === H[k - 1]! - GAP_OPEN
      j--
      state = opened ? from[i * w + j] : 2
    } else {
      const opened = F[k] === H[k - w]! - GAP_OPEN
      i--
      state = opened ? from[i * w + j] : 3
    }
  }
  return { score: best, pairs: pairs.reverse() }
}

// --- placing the query --------------------------------------------------------

export interface PlacedQuery {
  fasta: string
  newick?: string
  // the query row's name: the label given, with the segment appended Pfam-style
  queryName: string
  // the seed row the query was aligned through, and how well
  anchor: { name: string; accession?: string; score: number; identity: number }
  // 1-based inclusive residues of the query the anchor's segment aligned to
  domain: { start: number; end: number }
  // how many seed rows the alignment carries, of how many the seed has
  kept: number
  total: number
  // whether rows were dropped to fit `maxChars`
  thinned: boolean
  // whether the anchor row was the query protein itself, and so replaced
  replaced: boolean
}

export interface PlaceOptions {
  // query row label, a single FASTA/Newick token; the aligned segment is
  // appended to it (`TP53/99-289`)
  queryName: string
  // the query's own UniProt accession, so a seed row that IS the query is
  // recognised and replaced rather than duplicated
  uniprotId?: string
  // 0-based half-open slice of the query to align within — the domain's
  // neighbourhood — so a titin-sized query does not cost a full matrix per row
  window?: { start: number; end: number }
  newick?: string
  // largest FASTA the caller can carry; rows least like the query are dropped
  // (anchor kept) to fit, and the tree is pruned to what stays
  maxChars?: number
}

const gapsOf = (n: number) => '-'.repeat(n)

function ungapped(aligned: string) {
  const columns: number[] = []
  let seq = ''
  for (let c = 0; c < aligned.length; c++) {
    const ch = aligned[c]!
    if (ch !== '-') {
      seq += ch
      columns.push(c)
    }
  }
  return { seq, columns }
}

const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\/-]/g, '\\$&')

// The leaf `name` in a Newick string, as a match: preceded by a delimiter,
// followed by a length, a comma or a close-paren.
function leafPattern(name: string) {
  return new RegExp(`(?<=[(,])${escapeRegExp(name)}(?=[:,)])`)
}

export function graftLeaf(newick: string, beside: string, added: string) {
  return newick.replace(leafPattern(beside), `(${beside}:0,${added}:0)`)
}

export function renameLeaf(newick: string, from: string, to: string) {
  return newick.replace(leafPattern(from), to)
}

interface NewickNode {
  name: string
  length?: string
  children?: NewickNode[]
}

function parseNewick(text: string): NewickNode {
  let pos = 0
  const label = () => {
    const start = pos
    while (pos < text.length && !'(),:;'.includes(text[pos]!)) {
      pos++
    }
    return text.slice(start, pos).trim()
  }
  const node = (): NewickNode => {
    const out: NewickNode = { name: '' }
    if (text[pos] === '(') {
      out.children = []
      do {
        pos++
        out.children.push(node())
      } while (text[pos] === ',')
      pos++
    }
    out.name = label()
    if (text[pos] === ':') {
      pos++
      out.length = label()
    }
    return out
  }
  return node()
}

function serializeNewick(n: NewickNode): string {
  const kids = n.children
    ? `(${n.children.map(serializeNewick).join(',')})`
    : ''
  return `${kids}${n.name}${n.length === undefined ? '' : `:${n.length}`}`
}

const sumLengths = (a?: string, b?: string) =>
  a === undefined ? b : b === undefined ? a : String(Number(a) + Number(b))

// The tree cut down to the named leaves: a dropped leaf takes its edge with
// it, and a node left with one child collapses into that child with the two
// edge lengths summed. Undefined when the named leaves are not all in it,
// since a tree missing a row misdraws the alignment.
export function pruneNewick(newick: string, keep: Set<string>) {
  let found = 0
  const prune = (n: NewickNode): NewickNode | undefined => {
    if (!n.children) {
      if (!keep.has(n.name)) {
        return undefined
      }
      found++
      return n
    }
    const children = n.children.flatMap(c => prune(c) ?? [])
    if (children.length === 0) {
      return undefined
    }
    if (children.length === 1) {
      const [only] = children
      return { ...only!, length: sumLengths(n.length, only!.length) }
    }
    return { ...n, children }
  }
  const root = prune(parseNewick(newick))
  return root && found === keep.size
    ? `${serializeNewick({ ...root, length: undefined })};`
    : undefined
}

// Puts the query into the seed: aligns it against every row, anchors on the
// best, projects, and emits FASTA (query first) plus the tree with the query
// grafted beside its anchor.
export function placeQuery(
  query: string,
  seed: StockholmAlignment,
  { queryName, uniprotId, window, newick, maxChars }: PlaceOptions,
): PlacedQuery {
  const rows = seed.rows.map(r => ({ ...r, ...ungapped(r.aligned) }))
  const ws = Math.max(0, window?.start ?? 0)
  const we = Math.min(query.length, window?.end ?? query.length)
  const slice = query.slice(ws, we)
  const scored = rows.map(row => ({
    row,
    alignment: localAlign(slice, row.seq),
  }))
  const bestIdx = scored.reduce(
    (b, s, i) => (s.alignment.score > scored[b]!.alignment.score ? i : b),
    0,
  )
  const { row: anchor, alignment } = scored[bestIdx]!
  if (alignment.pairs.length === 0) {
    throw new Error(
      `${queryName} does not align to any row of the ${seed.accession ?? 'seed'} alignment`,
    )
  }
  const pairs = alignment.pairs.map(([q, t]): [number, number] => [q + ws, t])
  const identity =
    pairs.filter(([q, t]) => query[q] === anchor.seq[t]).length / pairs.length
  const replaced =
    !!uniprotId &&
    anchor.accession === bareAccession(uniprotId) &&
    pairs.length === anchor.seq.length

  // The query's residue at each seed column, and the residues to insert after
  // a column where the anchor has no counterpart.
  const nCols = anchor.aligned.length
  const atColumn: string[] = Array.from({ length: nCols }, () => '-')
  const insertAfter = new Map<number, string>()
  const [firstQ] = pairs[0]!
  const [lastQ] = pairs.at(-1)!
  for (let p = 0; p < pairs.length; p++) {
    const [q, t] = pairs[p]!
    atColumn[anchor.columns[t]!] = query[q]!
    const next = pairs[p + 1]
    if (next && next[0] > q + 1) {
      insertAfter.set(anchor.columns[t]!, query.slice(q + 1, next[0]))
    }
  }

  const project = (aligned: string | undefined, isQuery: boolean) => {
    let out = ''
    for (let c = 0; c < nCols; c++) {
      out += isQuery ? atColumn[c] : aligned![c]
      const ins = insertAfter.get(c)
      if (ins) {
        out += isQuery ? ins : gapsOf(ins.length)
      }
    }
    return out
  }

  // Rows ranked by how well the query aligns to them, anchor first, so a
  // budget keeps the family members nearest the query.
  const ranked = scored
    .map((s, i) => ({ ...s, i }))
    .filter(s => !(replaced && s.i === bestIdx))
    .sort((a, b) =>
      a.i === bestIdx
        ? -1
        : b.i === bestIdx
          ? 1
          : b.alignment.score - a.alignment.score,
    )
  const width = project(undefined, true).length
  const rowCost = (name: string) => name.length + width + 3
  const segment = `${firstQ + 1}-${lastQ + 1}`
  const queryRow = rows.some(r => r.name === `${queryName}/${segment}`)
    ? `${queryName}_query/${segment}`
    : `${queryName}/${segment}`
  let budget = maxChars === undefined ? Infinity : maxChars
  budget -= rowCost(queryRow)
  const kept: typeof ranked = []
  for (const s of ranked) {
    if (budget - rowCost(s.row.name) < 0) {
      break
    }
    budget -= rowCost(s.row.name)
    kept.push(s)
  }
  const thinned = kept.length < ranked.length
  // Back in the seed's own order, which is the tree's leaf order.
  kept.sort((a, b) => a.i - b.i)

  const fasta = [
    `>${queryRow}\n${project(undefined, true)}`,
    ...kept.map(s => `>${s.row.name}\n${project(s.row.aligned, false)}`),
  ].join('\n')
  const leaves = new Set([anchor.name, ...kept.map(s => s.row.name)])
  const base =
    newick && leafPattern(anchor.name).test(newick)
      ? thinned
        ? pruneNewick(newick, leaves)
        : newick
      : undefined
  const tree = base
    ? replaced
      ? renameLeaf(base, anchor.name, queryRow)
      : graftLeaf(base, anchor.name, queryRow)
    : undefined
  return {
    fasta,
    newick: tree,
    queryName: queryRow,
    anchor: {
      name: anchor.name,
      accession: anchor.accession,
      score: alignment.score,
      identity,
    },
    domain: { start: firstQ + 1, end: lastQ + 1 },
    kept: kept.length,
    total: seed.rows.length,
    thinned,
    replaced,
  }
}

// The alignment columns (0-based) holding residues `start`..`end` (1-based
// inclusive) of the named row — for a viewer that highlights columns rather
// than a row's residues.
export function rowResidueColumns(
  fasta: string,
  rowName: string,
  start: number,
  end: number,
): number[] {
  const record = fasta
    .split(/^>/m)
    .find(r => r.split('\n')[0]?.trim() === rowName)
  const aligned = record?.split('\n').slice(1).join('') ?? ''
  const columns: number[] = []
  let residue = 0
  for (let c = 0; c < aligned.length && residue < end; c++) {
    if (aligned[c] !== '-') {
      residue++
      if (residue >= start) {
        columns.push(c)
      }
    }
  }
  return columns
}

// A FASTA/Newick token for the query row: the gene symbol, made safe.
export function queryLabel(symbol: string) {
  return (
    symbol.replace(/[^A-Za-z0-9]+/g, '_').replace(/^_+|_+$/g, '') || 'QUERY'
  )
}
