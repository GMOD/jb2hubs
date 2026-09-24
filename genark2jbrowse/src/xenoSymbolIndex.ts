// A GCA hub has no NCBI annotation to text-index, but most carry UCSC's
// xenoRefGene track: RefSeq mRNAs from other species aligned to the assembly,
// named only by accession. Joined to NCBI gene2refseq's accession -> symbol
// table, that is a gene-symbol search for assemblies that otherwise have none.

export interface XenoRefGeneRow {
  refName: string
  start: number
  end: number
  accession: string
}

// The line `jbrowse text-index` writes for ixIxx (text-indexing-core's
// trixLine, which indexes every attr), so every JBrowse release that reads a
// GCF hub's index reads this.
export function trixLine(
  loc: string,
  trackId: string,
  attrs: string[],
  words = attrs,
) {
  const fields = [loc, trackId, ...attrs].map(f => `"${encodeURIComponent(f)}"`)
  return `[${fields.join('|')}] ${[...new Set(words)].join(' ')}\n`
}

// PAX6 over Pax6 over pax6: the upper-case spelling labels a key several
// species spell differently, and otherwise the first in code-point order.
function labelSpelling(spellings: Set<string>) {
  return [...spellings].sort((a, b) => {
    const au = a === a.toUpperCase()
    const bu = b === b.toUpperCase()
    return au === bu ? (a < b ? -1 : a > b ? 1 : 0) : au ? -1 : 1
  })[0]!
}

// One record per symbol per overlapping cluster on a sequence: human, mouse
// and zebrafish PAX6 mRNAs aligned to one locus are one search hit, because
// the search dropdown merges only identical locstrings. The spellings differ
// only in case, and trix matches case-insensitively, so the label is the one
// indexed word; the other spellings and the accessions ride along in the
// record, and an accession with no symbol is dropped.
export function xenoSymbolIndexLines(
  rows: XenoRefGeneRow[],
  symbols: Map<string, string>,
  trackId: string,
) {
  const groups = new Map<string, (XenoRefGeneRow & { symbol: string })[]>()
  for (const row of rows) {
    const symbol = symbols.get(row.accession.split('.')[0]!)
    if (symbol) {
      const key = `${row.refName}\t${symbol.toLowerCase()}`
      const group = groups.get(key) ?? []
      group.push({ ...row, symbol })
      groups.set(key, group)
    }
  }

  const lines: string[] = []
  for (const group of groups.values()) {
    group.sort((a, b) => a.start - b.start || a.end - b.end)
    let cluster:
      | { start: number; end: number; spellings: Set<string>; accs: string[] }
      | undefined
    const flush = () => {
      if (cluster) {
        const label = labelSpelling(cluster.spellings)
        const others = [...cluster.spellings].filter(s => s !== label).sort()
        const loc = `${group[0]!.refName}:${cluster.start + 1}..${cluster.end}`
        lines.push(
          trixLine(loc, trackId, [label, ...others, ...cluster.accs], [label]),
        )
      }
    }
    for (const row of group) {
      if (cluster && row.start < cluster.end) {
        cluster.end = Math.max(cluster.end, row.end)
        cluster.spellings.add(row.symbol)
        cluster.accs.push(row.accession)
      } else {
        flush()
        cluster = {
          start: row.start,
          end: row.end,
          spellings: new Set([row.symbol]),
          accs: [row.accession],
        }
      }
    }
    flush()
  }
  return lines
}
