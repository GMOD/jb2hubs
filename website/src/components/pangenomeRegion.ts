// Turning what a reader types into a region of the reference.
//
// The loci table is twenty examples; this is what makes the rest of the genome
// reachable, so it takes either a locstring or a gene symbol and hands back a
// window the sidecar and the launches can both use.

export interface ParsedRegion {
  chrom: string
  start: number
  end: number
}

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
  const digits = (s: string) => Number(s.replaceAll(/[,_]/g, ''))
  const start = Math.max(0, digits(m[2]!) - 1)
  const end = digits(m[3]!)
  return end > start ? { chrom: m[1]!, start, end } : undefined
}

// The file's own name for a chromosome a reader typed as `1`, `X` or `MT`, or
// undefined when it has no such sequence: tabix answers an unknown name with
// no rows, which would read as a window with no structural variation.
export function matchRefName(name: string, known: readonly string[]) {
  const bare = name.replace(/^chr/i, '')
  const upper = bare.toUpperCase()
  return [name, `chr${bare}`, `chr${upper === 'MT' ? 'M' : upper}`].find(n =>
    known.includes(n),
  )
}

export function formatRegion({ chrom, start, end }: ParsedRegion) {
  return `${chrom}:${(start + 1).toLocaleString('en-US')}-${end.toLocaleString('en-US')}`
}

// Context around a gene, so its flanks are in the window rather than its first
// and last base at the edges.
export const GENE_FLANK_BP = 10_000

interface MyGeneHit {
  symbol?: string
  genomic_pos?:
    | { chr?: string; start?: number; end?: number }
    | { chr?: string; start?: number; end?: number }[]
}

// A gene symbol as a region of the reference, through mygene.info, which the
// symbol type-ahead already uses. Its human coordinates are GRCh38, and a
// symbol on an unplaced contig or a patch comes back without a plain
// chromosome, which is not a window this graph can draw.
export async function resolveGeneRegion(
  symbol: string,
  taxId: number,
  fetchImpl: typeof fetch = fetch,
): Promise<ParsedRegion | undefined> {
  const url = `https://mygene.info/v3/query?q=symbol:${encodeURIComponent(symbol)}&species=${taxId}&fields=symbol,genomic_pos&size=5`
  const res = await fetchImpl(url)
  if (!res.ok) {
    throw new Error(`mygene.info: HTTP ${res.status}`)
  }
  const json = (await res.json()) as { hits?: MyGeneHit[] }
  for (const hit of json.hits ?? []) {
    const positions = [hit.genomic_pos ?? []].flat()
    for (const pos of positions) {
      if (
        pos.chr &&
        pos.start &&
        pos.end &&
        /^([0-9]{1,2}|X|Y|MT?)$/.test(pos.chr)
      ) {
        const start = Math.min(pos.start, pos.end)
        const end = Math.max(pos.start, pos.end)
        return {
          chrom: `chr${pos.chr === 'MT' ? 'M' : pos.chr}`,
          start: Math.max(0, start - 1 - GENE_FLANK_BP),
          end: end + GENE_FLANK_BP,
        }
      }
    }
  }
  return undefined
}

// What the box takes: a locstring, else a gene symbol.
export async function resolveRegion(
  text: string,
  taxId: number,
  fetchImpl: typeof fetch = fetch,
) {
  const parsed = parseRegion(text)
  if (parsed) {
    return parsed
  }
  const symbol = text.trim()
  if (!symbol) {
    return undefined
  }
  return resolveGeneRegion(symbol, taxId, fetchImpl)
}
