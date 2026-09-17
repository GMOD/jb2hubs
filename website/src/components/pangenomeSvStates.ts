// The structural states of the HPRC callset, and the forms a window of them
// groups the haplotypes into.
//
// This is the genome-wide replacement for a panel computed per curated locus.
// `buildHprcSvStates.sh` writes one row per structural record of the release 2
// callset — chrom, start, end, id, what each state means, and one character per
// haplotype — and publishes it beside the config as a tabix-indexed sidecar, 18
// MB for the genome. A window of any size is then a small ranged read, and
// `structuralForms` answers "which ways do these haplotypes differ here, and
// how many carry each" without anything precomputed per locus.
//
// Two rules make the answer biological rather than a list of alleles, both
// measured over the genome on 2026-09-17:
//
// - **States, not alleles.** An allele whose length differs from the reference
//   by under 50 bp is the reference's structure, which folds a poly-A tract's
//   46 lengths into one; RHD's forms went from 29 to 3, the third being its
//   known deletion. Larger changes key on their size change to two significant
//   figures, so one repeat unit is one state and two are another.
// - **A missing call is a state, not a dropped haplotype.** Where a haplotype's
//   path skips the site it has no call, which is what a deletion looks like:
//   229 of 462 haplotypes at UGT2B17, its known deletion, which the old rule
//   discarded.

// 1% of the 462 haplotypes: the smallest group worth its own lane, and the
// threshold under which a state is folded into its site's majority rather than
// splitting a form off by itself.
export const MIN_CARRIERS = 5

// Under this, an allele is the reference's structure.
export const STRUCTURAL_BP = 50

// Ranked by carriers and named in this order; `0` is the reference's structure,
// `.` not placed, `v` an inversion, `~` a state past the names, always rare.
const NAMES = '123456789abcdefghijklmnopqrstuwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ'
export const REFERENCE_STATE = '0'
export const MISSING_STATE = '.'
export const INVERTED_STATE = 'v'
export const OTHER_STATE = '~'

// What an allele does to the reference's structure: nothing, an inversion, or
// its size change to two significant figures, so one repeat unit reads as one
// state wherever the aligner put its boundaries (1,716 bp and 1,740 bp are both
// `-1700`) while one unit and two stay apart. Rounding to a share of the value
// itself rather than to a fixed width is what keeps that true across four
// orders of magnitude, from a 50 bp indel to an 84 kb deletion.
export function stateKey(delta: number, inverted: boolean) {
  const size = Math.abs(delta)
  if (size < STRUCTURAL_BP) {
    return inverted ? INVERTED_STATE : REFERENCE_STATE
  }
  const unit = 10 ** (Math.floor(Math.log10(size)) - 1)
  return `${delta > 0 ? '+' : '-'}${Math.round(size / unit) * unit}`
}

export interface SvStateRow {
  chrom: string
  start: number
  end: number
  id: string
  // symbol to size change, `1:-1700,2:+65000`, or `.`
  states: string
  // one character per haplotype, in the sidecar's haplotype order
  genotypes: string
}

// One record's genotypes as states. `calls` is one GT per sample, in the order
// its haplotypes are named; a diploid call gives two characters and a haploid
// one gives its own and a missing one.
export function packRecord({
  refLength,
  altLengths,
  inverted,
  calls,
}: {
  refLength: number
  altLengths: number[]
  inverted: boolean
  calls: string[]
}) {
  const keys = [
    REFERENCE_STATE,
    ...altLengths.map(n => stateKey(n - refLength, inverted)),
  ]
  const called: string[] = []
  for (const gt of calls) {
    const parts = gt.replaceAll('/', '|').split('|')
    for (const p of [parts[0], parts[1]]) {
      called.push(p === undefined || p === '.' || p === '' ? MISSING_STATE : keys[Number(p)]!)
    }
  }
  const carriers = new Map<string, number>()
  for (const state of called) {
    if (state !== REFERENCE_STATE && state !== MISSING_STATE && state !== INVERTED_STATE) {
      carriers.set(state, (carriers.get(state) ?? 0) + 1)
    }
  }
  const ranked = [...carriers].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1))
  const symbols = new Map(ranked.map(([key], i) => [key, NAMES[i] ?? OTHER_STATE]))
  const states = ranked
    .filter(([key]) => symbols.get(key) !== OTHER_STATE)
    .map(([key]) => `${symbols.get(key)}:${key}`)
  if (called.includes(INVERTED_STATE)) {
    states.push(`${INVERTED_STATE}:inv`)
  }
  return {
    states: states.join(',') || '.',
    genotypes: called
      .map(state =>
        state === REFERENCE_STATE || state === MISSING_STATE || state === INVERTED_STATE
          ? state
          : symbols.get(state)!,
      )
      .join(''),
  }
}

export function parseSvStateRow(line: string): SvStateRow {
  const [chrom, start, end, id, states, genotypes] = line.split('\t')
  return {
    chrom: chrom!,
    start: Number(start),
    end: Number(end),
    id: id!,
    states: states!,
    genotypes: genotypes!,
  }
}

export interface StructuralForm {
  // the haplotypes identical at every informative site in the window
  members: string[]
  // what they carry, one character per informative site
  key: string
}

export interface StructuralFormsResult {
  sites: number
  // sites where a second state reaches MIN_CARRIERS; the rest say nothing about
  // how these haplotypes differ
  informative: number
  // largest first
  forms: StructuralForm[]
  // haplotypes carrying a state too rare to define a form of its own
  rareCarriers: string[]
}

// The forms a window's records group `haplotypes` into.
export function structuralForms(
  rows: SvStateRow[],
  haplotypes: string[],
  minCarriers = MIN_CARRIERS,
): StructuralFormsResult {
  const informative: { genotypes: string; majority: string; common: Set<string> }[] = []
  const carriesRare = new Set<string>()
  for (const row of rows) {
    const counts = new Map<string, number>()
    for (const state of row.genotypes) {
      counts.set(state, (counts.get(state) ?? 0) + 1)
    }
    const ranked = [...counts].sort((a, b) => b[1] - a[1])
    const majorityState = ranked[0]![0]
    // Over every site, not only the informative ones: a deletion one haplotype
    // carries defines no form, and leaving it unsaid reads as a haplotype that
    // matches the reference here.
    ;[...row.genotypes].forEach((state, i) => {
      if (state !== majorityState && counts.get(state)! < minCarriers) {
        carriesRare.add(haplotypes[i]!)
      }
    })
    if (ranked.length > 1 && ranked[1]![1] >= minCarriers) {
      informative.push({
        genotypes: row.genotypes,
        majority: ranked[0]![0],
        common: new Set(
          ranked
            .filter(([state, n]) => n >= minCarriers && state !== OTHER_STATE)
            .map(([state]) => state),
        ),
      })
    }
  }
  const byKey = new Map<string, string[]>()
  haplotypes.forEach((haplotype, i) => {
    const key = informative
      .map(site => {
        const state = site.genotypes[i]!
        return site.common.has(state) ? state : site.majority
      })
      .join('')
    byKey.set(key, [...(byKey.get(key) ?? []), haplotype])
  })
  return {
    sites: rows.length,
    informative: informative.length,
    forms: [...byKey]
      .map(([key, members]) => ({ key, members }))
      .sort((a, b) => b.members.length - a.members.length || (a.key < b.key ? -1 : 1)),
    rareCarriers: haplotypes.filter(h => carriesRare.has(h)),
  }
}
