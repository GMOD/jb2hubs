// How the build scripts pack a callset into the sidecar's rows, which
// `pangenomeSvStates.ts` reads: each record's genotypes as ranked states, and
// for HPRC the restored parents' residual states and the no calls a parent
// above places.

import {
  EXCLUDED_SAMPLES,
  INVERTED_STATE,
  MISSING_STATE,
  OTHER_STATE,
  PLACED_STATE,
  REFERENCE_STATE,
  STRUCTURAL_BP,
} from './pangenomeSvStates.ts'

// The callset's sample columns the sidecar packs
export const comparedColumns = (samples: string[]) =>
  samples.flatMap((s, i) => (EXCLUDED_SAMPLES.includes(s) ? [] : [i]))

// The same floor at a restored parent, whose allele sums every indel under 50
// bp that no row reports.
export const RESTORED_STRUCTURAL_BP = 1000

// A row's states, ranked by carriers and named in this order
const NAMES = '123456789abcdefghijklmnopqrstuwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ'
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

// The allele each haplotype carries, undefined where it has no call. `calls` is
// one GT per sample, in the order its haplotypes are named, and each sample
// has `ploidy` haplotypes: HPRC's samples have two, and a haploid call (chrX)
// gives its own and a missing one; cattle's assemblies have one each.
function calledAlleles(calls: string[], ploidy = 2) {
  return calls.flatMap(gt =>
    gt
      .replaceAll('/', '|')
      .split('|')
      .concat(Array<string>(ploidy).fill('.'))
      .slice(0, ploidy)
      .map(p => (p === '.' || p === '' ? undefined : Number(p))),
  )
}

// Each haplotype's size change against the reference allele.
export function calledDeltas({
  refLength,
  altLengths,
  calls,
  ploidy,
}: {
  refLength: number
  altLengths: number[]
  calls: string[]
  ploidy?: number
}) {
  return calledAlleles(calls, ploidy).map(allele =>
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

// One record's genotypes as states. `inverted` is a flag on the whole record
// (vcfwave's INV) or one per ALT (`invertedAlleles`).
export function packRecord({
  refLength,
  altLengths,
  inverted,
  calls,
  ploidy,
}: {
  refLength: number
  altLengths: number[]
  inverted: boolean | boolean[]
  calls: string[]
  ploidy?: number
}) {
  const keys = [
    REFERENCE_STATE,
    ...altLengths.map((n, i) =>
      stateKey(
        n - refLength,
        typeof inverted === 'boolean' ? inverted : inverted[i]!,
      ),
    ),
  ]
  return packStates(
    calledAlleles(calls, ploidy).map(allele =>
      allele === undefined ? MISSING_STATE : keys[allele]!,
    ),
  )
}

// Which ALTs of a `vg deconstruct` record step through a node against the
// reference's orientation, from its AT field (`>1>2>4,>1<3>4`): minigraph
// writes an inversion as a bubble whose allele walks the segment backwards,
// and no INFO flag says so.
export function invertedAlleles(traversals: string) {
  const [ref = '', ...alts] = traversals.split(',')
  const against = ref.startsWith('<') ? '>' : '<'
  return alts.map(at => at.includes(against))
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
