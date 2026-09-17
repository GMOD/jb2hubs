// Which haplotypes to draw as lanes at one locus, chosen from the callset.
//
// The GBZ lane track can draw any of HPRC's 464 haplotypes, and opening all of
// them is a wall no reader can use. The tutorial's fixed eight are a panel
// someone picked for one locus (the CFHR3-CFHR1 deletion) and mean nothing at
// another. What a reader wants at a locus is one lane per way the haplotypes
// differ structurally there, with the common ways first: the reference-like
// haplotype beside the deletion carriers beside the haplotype with the extra
// copy, each labelled with how many of the panel share it.
//
// The callset already says that. Over the launch window, every haplotype's
// genotypes at the SV-tier sites (the same filter the variant lane draws with)
// form a vector, and haplotypes with identical vectors are one structural
// configuration. `choosePanel` groups on that and picks representatives, most
// common configuration first, breaking ties towards the configuration least like
// the ones already chosen. `website/generatePangenomePanels.ts` runs it over the
// curated loci and commits the result; nothing here fetches.

export interface PanelLane {
  // PanSN prefix, `HG01123#1`, which is how the lane track names a haplotype.
  haplotype: string
  // Haplotypes with the identical SV-tier genotype vector, this one included.
  shares: number
  // Sites at which the vector differs from the reference.
  nonReference: number
}

export interface StructuralPanel {
  // SV-tier records in the window, after the filter.
  sites: number
  // Haplotypes with a call at every site; the rest are left out of the groups.
  haplotypes: number
  // Distinct genotype vectors among those haplotypes.
  configurations: number
  lanes: PanelLane[]
}

export interface HaplotypeGenotypes {
  haplotype: string
  // One allele index per site; undefined where the call is missing.
  alleles: (number | undefined)[]
}

export const DEFAULT_PANEL_SIZE = 8

// A missing call is not a configuration: it would group haplotypes by where
// the caller gave up, and a lane opened on one would draw a haplotype the
// callset could not place. They are dropped from the grouping and counted out
// of `haplotypes`.
function complete(
  g: HaplotypeGenotypes,
): g is { haplotype: string; alleles: number[] } {
  return g.alleles.every(a => a !== undefined)
}

function hamming(a: number[], b: number[]) {
  let d = 0
  for (const [i, x] of a.entries()) {
    if (x !== b[i]) {
      d++
    }
  }
  return d
}

// The alphabetically first haplotype the reader can serve stands for a group:
// a deterministic pick, so a rerun over the same callset names the same lanes.
function representative(members: string[], unreadable: ReadonlySet<string>) {
  return members.filter(m => !unreadable.has(m)).sort()[0]
}

// `unreadable` names haplotypes the lane reader cannot serve in this window. A
// configuration none of whose members it can serve still counts, and gets no
// lane.
export function choosePanel(
  genotypes: HaplotypeGenotypes[],
  size = DEFAULT_PANEL_SIZE,
  unreadable: ReadonlySet<string> = new Set(),
): StructuralPanel | undefined {
  const sites = genotypes[0]?.alleles.length ?? 0
  if (sites === 0) {
    return undefined
  }
  const groups = new Map<string, { alleles: number[]; members: string[] }>()
  for (const g of genotypes) {
    if (!complete(g)) {
      continue
    }
    const key = g.alleles.join(',')
    const group = groups.get(key)
    if (group) {
      group.members.push(g.haplotype)
    } else {
      groups.set(key, { alleles: g.alleles, members: [g.haplotype] })
    }
  }
  const remaining = [...groups.values()].filter(
    g => representative(g.members, unreadable) !== undefined,
  )
  const chosen: typeof remaining = []
  while (chosen.length < size && remaining.length > 0) {
    // Most common first; among equally common configurations, the one least
    // like anything already on the panel, so a locus of singletons still
    // spreads its lanes across the range rather than stacking near-twins.
    const distance = (g: (typeof remaining)[number]) =>
      chosen.length === 0
        ? 0
        : Math.min(...chosen.map(c => hamming(c.alleles, g.alleles)))
    remaining.sort(
      (a, b) =>
        b.members.length - a.members.length ||
        distance(b) - distance(a) ||
        representative(a.members, unreadable)!.localeCompare(
          representative(b.members, unreadable)!,
        ),
    )
    chosen.push(remaining.shift()!)
  }
  return {
    sites,
    haplotypes: [...groups.values()].reduce((n, g) => n + g.members.length, 0),
    configurations: groups.size,
    lanes: chosen.map(g => ({
      haplotype: representative(g.members, unreadable)!,
      shares: g.members.length,
      nonReference: g.alleles.filter(a => a !== 0).length,
    })),
  }
}

// One VCF genotype column per sample, `0|1`, into the two haplotypes' allele
// indices. A haploid call (`2|.`, how the callset writes CHM13) yields a missing
// second haplotype, and an unphased `/` is read the same as `|`: every sample in
// this callset is phased, and the separator is not the point.
export function splitGenotype(
  gt: string,
): [number | undefined, number | undefined] {
  const [a, b] = gt.split(/[|/]/)
  const parse = (s: string | undefined) =>
    s === undefined || s === '.' || s === '' ? undefined : Number(s)
  return [parse(a), parse(b)]
}
