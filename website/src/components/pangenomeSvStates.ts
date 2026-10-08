// The structural states of the HPRC callset, and the forms a window of them
// groups the haplotypes into.
//
// This is the genome-wide replacement for a panel computed per curated locus.
// `buildHprcSvStates.sh` writes one row per structural record of the release 2
// callset — chrom, start, end, id, what each state means, and one character per
// haplotype — and publishes it beside the config as a tabix-indexed sidecar, 19
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
// - **A missing call is one of two states, not a dropped haplotype.** vcfbub
//   removed every snarl with an allele over 100 kb and kept its children, so a
//   haplotype that bypasses a child has no call there. The build restores those
//   parents from the release's raw callset: `_` is a no call under a snarl that
//   calls the haplotype, and that snarl's row says what it carries (UGT2B17's
//   229 read a 120 kb deletion). `.` is a haplotype no snarl above calls, which
//   the graph does not carry through the site.

// 1% of the 462 haplotypes: the smallest group worth its own lane, and the
// threshold under which a state is folded into its site's majority rather than
// splitting a form off by itself.
export const MIN_CARRIERS = 5

// Under this, an allele is the reference's structure.
export const STRUCTURAL_BP = 50

// The same floor at a restored parent, whose allele sums every indel under 50
// bp that no row reports.
export const RESTORED_STRUCTURAL_BP = 1000

// Ranked by carriers and named in this order; `0` is the reference's structure,
// `.` not placed, `_` on another route through a parent that calls the
// haplotype, `v` an inversion, `~` a state past the names, always rare.
const NAMES = '123456789abcdefghijklmnopqrstuwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ'
export const REFERENCE_STATE = '0'
export const MISSING_STATE = '.'
export const PLACED_STATE = '_'
export const INVERTED_STATE = 'v'
export const OTHER_STATE = '~'

// What an allele does to the reference's structure: nothing, an inversion, or
// its size change to two significant figures, so one repeat unit reads as one
// state wherever the aligner put its boundaries (1,716 bp and 1,740 bp are both
// `-1700`) while one unit and two stay apart. Rounding to a share of the value
// itself rather than to a fixed width is what keeps that true across four
// orders of magnitude, from a 50 bp indel to an 84 kb deletion.
export function stateKey(
  delta: number,
  inverted: boolean,
  structuralBp = STRUCTURAL_BP,
) {
  const size = Math.abs(delta)
  if (size < structuralBp) {
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

// The allele each haplotype carries, undefined where it has no call. `calls` is
// one GT per sample, in the order its haplotypes are named; a diploid call
// gives two and a haploid one gives its own and a missing one.
export function calledAlleles(calls: string[]) {
  return calls.flatMap(gt => {
    const parts = gt.replaceAll('/', '|').split('|')
    return [parts[0], parts[1]].map(p =>
      p === undefined || p === '.' || p === '' ? undefined : Number(p),
    )
  })
}

// Each haplotype's size change against the reference allele.
export function calledDeltas({
  refLength,
  altLengths,
  calls,
}: {
  refLength: number
  altLengths: number[]
  calls: string[]
}) {
  return calledAlleles(calls).map(allele =>
    allele === undefined
      ? undefined
      : allele === 0
        ? 0
        : altLengths[allele - 1]! - refLength,
  )
}

// One state key per haplotype, as a row: the size changes named by rank.
function packStates(called: string[]) {
  const carriers = new Map<string, number>()
  for (const state of called) {
    if (
      state !== REFERENCE_STATE &&
      state !== MISSING_STATE &&
      state !== INVERTED_STATE
    ) {
      carriers.set(state, (carriers.get(state) ?? 0) + 1)
    }
  }
  const ranked = [...carriers].sort(
    (a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1),
  )
  const symbols = new Map(
    ranked.map(([key], i) => [key, NAMES[i] ?? OTHER_STATE]),
  )
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
        state === REFERENCE_STATE ||
        state === MISSING_STATE ||
        state === INVERTED_STATE
          ? state
          : symbols.get(state)!,
      )
      .join(''),
  }
}

// One record's genotypes as states.
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
  return packStates(
    calledAlleles(calls).map(allele =>
      allele === undefined ? MISSING_STATE : keys[allele]!,
    ),
  )
}

export type Deltas = (number | undefined)[]

// A restored parent's states. A parent's allele sums what its children carry,
// so the state is what remains once the children that call the haplotype are
// taken out (`explained`): the size of the route a haplotype takes where it
// bypasses them. Without that, HP's 1.7 kb deletion reads twice, at its own row
// and at the parent's.
export function packResidual(deltas: Deltas, explained: number[]) {
  return packStates(
    deltas.map((delta, i) =>
      delta === undefined
        ? MISSING_STATE
        : stateKey(delta - explained[i]!, false, RESTORED_STRUCTURAL_BP),
    ),
  )
}

// A row's no calls, split by whether a snarl above it calls the haplotype.
export function markPlaced(genotypes: string, above: Deltas[]) {
  let marked = ''
  for (let i = 0; i < genotypes.length; i++) {
    const state = genotypes[i]!
    marked +=
      state === MISSING_STATE && above.some(a => a[i] !== undefined)
        ? PLACED_STATE
        : state
  }
  return marked
}

export interface ParentRecord {
  chrom: string
  start: number
  end: number
  id: string
  // the snarl above this one, `.` at the top level
  parent: string
  deltas: Deltas
}

// A removed parent snarl, from the raw callset's record with allele lengths in
// place of sequences: CHROM POS ID LV PS refLength altLengths, then one GT per
// sample. `kept` indexes the samples whose haplotypes the sidecar names.
export function parseParent(line: string, kept: number[]): ParentRecord {
  const f = line.split('\t')
  const [chrom, pos, id, , parent, refLength, altLengths] = f
  const calls = f.slice(7)
  const start = Number(pos) - 1
  return {
    chrom: chrom!,
    start,
    end: start + Number(refLength),
    id: id!,
    parent: parent!,
    deltas: calledDeltas({
      refLength: Number(refLength),
      altLengths: altLengths!.split(',').map(Number),
      calls: kept.map(i => calls[i]!),
    }),
  }
}

// The removed snarls above a row, nearest first.
export function ancestorChain(
  parent: string,
  parents: ReadonlyMap<string, ParentRecord>,
) {
  const chain: ParentRecord[] = []
  for (
    let p = parents.get(parent);
    p && !chain.includes(p);
    p = parents.get(p.parent)
  ) {
    chain.push(p)
  }
  return chain
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
  // the key read against the reference: the size change at each site where the
  // form is not the reference's structure, largest first, and how many sites
  // it inverts, has no call at, or carries a rare state at where most
  // haplotypes have no call
  deltas: number[]
  inversions: number
  uncalled: number
  rarer: number
  // sites it bypasses on another route through a snarl that calls it
  bypassed: number
}

// A row's `1:-1700,2:+65000` as symbol to size change.
function stateDeltas(states: string) {
  return new Map(
    states.split(',').flatMap(entry => {
      const [symbol, delta] = entry.split(':')
      return symbol && Number.isFinite(Number(delta))
        ? [[symbol, Number(delta)] as const]
        : []
    }),
  )
}

export interface StructuralFormsResult {
  sites: number
  // sites where a second state reaches MIN_CARRIERS; the rest say nothing about
  // how these haplotypes differ
  informative: number
  // largest first, over the haplotypes with a call at some site
  forms: StructuralForm[]
  // haplotypes with no call at any site: the graph does not carry them through
  // one, so no form holds them
  unplaced: string[]
  // haplotypes carrying a state too rare to define a form of its own
  rareCarriers: string[]
  // sites whose commonest state is not the reference's structure: a deletion
  // most haplotypes carry, or a site most of their paths skip
  nonReferenceMajority: number
}

// The forms a window's records group `haplotypes` into.
export function structuralForms(
  rows: SvStateRow[],
  haplotypes: string[],
  minCarriers = MIN_CARRIERS,
): StructuralFormsResult {
  const informative: {
    genotypes: string
    majority: string
    common: Set<string>
    deltas: Map<string, number>
  }[] = []
  const carriesRare = new Set<string>()
  let nonReferenceMajority = 0
  for (const row of rows) {
    const counts = new Map<string, number>()
    for (const state of row.genotypes) {
      counts.set(state, (counts.get(state) ?? 0) + 1)
    }
    const ranked = [...counts].sort((a, b) => b[1] - a[1])
    const majorityState = ranked[0]![0]
    if (majorityState !== REFERENCE_STATE) {
      nonReferenceMajority += 1
    }
    // Over every site, not only the informative ones: a deletion one haplotype
    // carries defines no form, and leaving it unsaid reads as a haplotype that
    // matches the reference here.
    for (let i = 0; i < row.genotypes.length; i++) {
      const state = row.genotypes[i]!
      if (state !== majorityState && counts.get(state)! < minCarriers) {
        carriesRare.add(haplotypes[i]!)
      }
    }
    if (ranked.length > 1 && ranked[1]![1] >= minCarriers) {
      informative.push({
        genotypes: row.genotypes,
        majority: majorityState,
        common: new Set(
          ranked
            .filter(([state, n]) => n >= minCarriers && state !== OTHER_STATE)
            .map(([state]) => state),
        ),
        deltas: stateDeltas(row.states),
      })
    }
  }
  const unplaced = new Set(
    haplotypes.filter(
      (_, i) =>
        rows.length > 0 && rows.every(r => r.genotypes[i] === MISSING_STATE),
    ),
  )
  const byKey = new Map<string, string[]>()
  haplotypes.forEach((haplotype, i) => {
    if (unplaced.has(haplotype)) {
      return
    }
    const key = informative
      .map(site => {
        const state = site.genotypes[i]!
        // A rare state folds into the majority, except a call into a no-call
        // majority: at SMN's 1.6 Mb parent 157 haplotypes have no call and 97
        // carry a size fewer than MIN_CARRIERS share.
        return site.common.has(state)
          ? state
          : state !== MISSING_STATE && site.majority === MISSING_STATE
            ? OTHER_STATE
            : site.majority
      })
      .join('')
    byKey.set(key, [...(byKey.get(key) ?? []), haplotype])
  })
  return {
    sites: rows.length,
    informative: informative.length,
    forms: [...byKey]
      .map(([key, members]) => {
        const states = [...informative.keys()].map(i => key.charAt(i))
        return {
          key,
          members,
          deltas: states
            .flatMap((state, i) => informative[i]!.deltas.get(state) ?? [])
            .sort((a, b) => Math.abs(b) - Math.abs(a)),
          inversions: states.filter(s => s === INVERTED_STATE).length,
          uncalled: states.filter(s => s === MISSING_STATE).length,
          rarer: states.filter(s => s === OTHER_STATE).length,
          bypassed: states.filter(s => s === PLACED_STATE).length,
        }
      })
      .sort(
        (a, b) =>
          b.members.length - a.members.length || (a.key < b.key ? -1 : 1),
      ),
    unplaced: [...unplaced],
    rareCarriers: haplotypes.filter(h => carriesRare.has(h)),
    nonReferenceMajority,
  }
}
