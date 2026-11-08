// Turning what a reader types into a region of the reference.
//
// The page offers a few examples; this is what makes the rest of the genome
// reachable, so it takes either a locstring or a gene symbol and hands back a
// window the sidecar and the launches can both use.

export interface ParsedRegion {
  chrom: string
  start: number
  end: number
}

const digits = (s: string) => Number(s.replaceAll(/[,_]/g, ''))

// `chr1:196,740,000-196,850,000`, with `..` or `-` and separators optional. The
// coordinates a reader pastes are 1-based, the way a browser's location box
// shows them, and come back 0-based like everything else here.
export function parseRegion(text: string): ParsedRegion | undefined {
  const m = /^\s*([\w.]+)\s*:\s*([\d,_]+)\s*(?:-|\.\.)\s*([\d,_]+)\s*$/.exec(
    text,
  )
  if (!m) {
    return undefined
  }
  const start = Math.max(0, digits(m[2]!) - 1)
  const end = digits(m[3]!)
  return end > start ? { chrom: m[1]!, start, end } : undefined
}

const bare = (n: string) => {
  const upper = n.replace(/^chr/i, '').toUpperCase()
  return upper === 'MT' ? 'M' : upper
}

// The file's own name for a chromosome a reader typed as `1`, `x`, `MT` or
// `chr1` (Arabidopsis names it `Chr1`), or undefined when it has no such
// sequence: tabix answers an unknown name with no rows, which would read as a
// window with no structural variation.
export function matchRefName(name: string, known: readonly string[]) {
  return known.find(k => k === name) ?? known.find(k => bare(k) === bare(name))
}

export interface GraphSequence {
  name: string
  length: number
  aliases?: string[]
}

// Every name the sequence goes by, its own first: the reference's gene files
// may name it otherwise (NC_003070.9 for Arabidopsis's Chr1).
export function sequenceNames(
  chrom: string,
  sequences: readonly GraphSequence[],
) {
  return [chrom, ...(sequences.find(s => s.name === chrom)?.aliases ?? [])]
}

// A region on the graph's own sequence, cut to its length, or undefined when
// the graph has no such sequence or the region starts past its end.
export function placeRegion<T extends ParsedRegion>(
  region: T,
  sequences: readonly GraphSequence[],
): T | undefined {
  const chrom =
    matchRefName(
      region.chrom,
      sequences.map(s => s.name),
    ) ?? sequences.find(s => s.aliases?.includes(region.chrom))?.name
  const length = sequences.find(s => s.name === chrom)?.length
  return chrom !== undefined && length !== undefined && region.start < length
    ? { ...region, chrom, end: Math.min(region.end, length) }
    : undefined
}

// A bare sequence name, `chr6` or `6`, is the whole of it.
export function wholeSequence(
  text: string,
  sequences: readonly GraphSequence[],
): GeneRegion | undefined {
  const chrom = matchRefName(
    text.trim(),
    sequences.map(s => s.name),
  )
  const length = sequences.find(s => s.name === chrom)?.length
  return chrom !== undefined && length !== undefined
    ? { chrom, start: 0, end: length }
    : undefined
}

export function formatRegion({ chrom, start, end }: ParsedRegion) {
  return `${chrom}:${(start + 1).toLocaleString('en-US')}-${end.toLocaleString('en-US')}`
}

// Context around a gene, so its flanks are in the window rather than its first
// and last base at the edges.
export const GENE_FLANK_BP = 10_000

// The region is the gene and its flanks; `gene` is the gene alone, and
// `symbol` the reference's own name for it, so `her2` comes back as ERBB2.
export interface GeneRegion extends ParsedRegion {
  symbol?: string
  gene?: { start: number; end: number }
}

export interface WindowGene {
  symbol: string
  start: number
  end: number
}

// What the box takes: a locstring, else a gene symbol, which `lookupGene`
// places.
export async function resolveRegion(
  text: string,
  lookupGene: (symbol: string) => Promise<GeneRegion | undefined>,
): Promise<GeneRegion | undefined> {
  const symbol = text.trim()
  return parseRegion(text) ?? (symbol ? lookupGene(symbol) : undefined)
}
