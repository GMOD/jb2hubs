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

// 1% of the haplotypes, and at least one: the smallest group worth its own
// lane, and the threshold under which a state is folded into its site's
// majority rather than splitting a form off by itself. HPRC's 462 give 5;
// cattle's 11 assemblies give 1, since yak, bison and gaur each stand alone.
export const minCarriersFor = (haplotypes: number) =>
  Math.max(1, Math.round(haplotypes / 100))

export const MIN_CARRIERS = minCarriersFor(462)

// The callset's sample columns the sidecar packs. CHM13 is in the callset as a
// haploid column and in the graph as a second reference, not a haplotype
// anyone compares against the rest.
export const comparedColumns = (samples: string[]) =>
  samples.flatMap((s, i) => (s === 'CHM13' ? [] : [i]))

// Under this, an allele is the reference's structure.
const STRUCTURAL_BP = 50

// The same floor at a restored parent, whose allele sums every indel under 50
// bp that no row reports.
export const RESTORED_STRUCTURAL_BP = 1000

// Ranked by carriers and named in this order; `0` is the reference's structure,
// `.` not placed, `_` on another route through a parent that calls the
// haplotype, `v` an inversion, `~` a state past the names, always rare.
const NAMES = '123456789abcdefghijklmnopqrstuwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ'
const REFERENCE_STATE = '0'
export const MISSING_STATE = '.'
export const PLACED_STATE = '_'
const INVERTED_STATE = 'v'
const OTHER_STATE = '~'

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

// The snarl a record belongs to, from its first graph id: vcfwave splits one
// bubble into records `>163282936>163284855_1`, `_2`, …, anchoring one event at
// several bases. Undefined for an id that names no snarl.
function snarlOf(id: string) {
  return id
    .split(';')
    .find(i => /^[<>]/.test(i))
    ?.replace(/_\d+$/, '')
}

// One record per size change per stretch of a snarl. C4's extra 26 kb module is
// anchored at a dozen bases, and each anchor's carriers would otherwise be a
// form of their own. Only records within the change's own size (1 kb at least)
// of each other merge: CFHR's +330 bp at one base and at another 21 kb away
// are two places, and one span over both would draw a placed change as net.
//
// A haplotype carries the merged change if it carries it at any of the
// records, else a rare change if it has one at any, else the reference's
// structure unless none of them calls it. Two copies of one change read as
// one. A record with an inversion or with no size change is left alone.
export function mergeSplitEvents(rows: SvStateRow[]) {
  const bySnarl = new Map<string, SvStateRow[]>()
  const merged: SvStateRow[] = []
  for (const row of rows) {
    const snarl = snarlOf(row.id)
    if (
      snarl &&
      stateDeltas(row.states).size > 0 &&
      !row.states.includes(`${INVERTED_STATE}:`)
    ) {
      bySnarl.set(snarl, [...(bySnarl.get(snarl) ?? []), row])
    } else {
      merged.push(row)
    }
  }
  for (const [snarl, group] of bySnarl) {
    if (group.length === 1) {
      merged.push(group[0]!)
      continue
    }
    const deltas = group.map(r => stateDeltas(r.states))
    const sizes = [...new Set(deltas.flatMap(d => [...d.values()]))]
    for (const size of sizes) {
      const reach = Math.max(Math.abs(size), 1000)
      const clusters: SvStateRow[][] = []
      for (const row of group.filter((_, j) =>
        [...deltas[j]!.values()].includes(size),
      )) {
        const last = clusters.at(-1)
        if (last && row.start - Math.max(...last.map(r => r.end)) <= reach) {
          last.push(row)
        } else {
          clusters.push([row])
        }
      }
      for (const cluster of clusters) {
        const inCluster = new Set(cluster)
        let genotypes = ''
        for (let i = 0; i < group[0]!.genotypes.length; i++) {
          const states = group.map(r => r.genotypes[i]!)
          genotypes += states.some(
            (s, j) => inCluster.has(group[j]!) && deltas[j]!.get(s) === size,
          )
            ? '1'
            : states.includes(OTHER_STATE)
              ? OTHER_STATE
              : states.every(s => s === MISSING_STATE)
                ? MISSING_STATE
                : states.every(s => s === MISSING_STATE || s === PLACED_STATE)
                  ? PLACED_STATE
                  : REFERENCE_STATE
        }
        merged.push({
          chrom: cluster[0]!.chrom,
          start: Math.min(...cluster.map(r => r.start)),
          end: Math.max(...cluster.map(r => r.end)),
          id: snarl,
          states: `1:${size}`,
          genotypes,
        })
      }
    }
  }
  return merged.sort((a, b) => a.start - b.start || a.end - b.end)
}

// What a form carries at one informative site where it is not the reference's
// structure. `bp` is the size of a deletion, an insertion or a shifted pair,
// and `site` indexes the result's `informativeSites`.
export interface SiteMark {
  site: number
  start: number
  end: number
  kind:
    | 'deletion'
    | 'insertion'
    | 'shifted'
    | 'inversion'
    | 'uncalled'
    | 'bypassed'
    | 'rarer'
  bp: number
}

function siteMark(
  state: string,
  site: number,
  {
    start,
    end,
    deltas,
  }: { start: number; end: number; deltas: Map<string, number> },
): SiteMark | undefined {
  const delta = deltas.get(state)
  const kind =
    state === INVERTED_STATE
      ? 'inversion'
      : state === MISSING_STATE
        ? 'uncalled'
        : state === PLACED_STATE
          ? 'bypassed'
          : state === OTHER_STATE
            ? 'rarer'
            : delta === undefined
              ? undefined
              : delta < 0
                ? 'deletion'
                : 'insertion'
  return kind && { site, start, end, kind, bp: Math.abs(delta ?? 0) }
}

// A size change at a site far wider than itself says how much shorter or longer
// a route through the site is, not where: SMN's restored 1.6 Mb parent has
// routes 240 kb shorter, while SMN1 itself is lost on 1–2% of haplotypes.
const DIFFUSE_MIN_SPAN = 10_000

export const diffuse = (m: SiteMark) =>
  (m.kind === 'deletion' || m.kind === 'insertion') &&
  m.end - m.start > Math.max(2 * m.bp, DIFFUSE_MIN_SPAN)

// A deletion and an insertion of one size, within 10% and 1 kb or more and no
// further apart than twice that size, are the reference's length with the
// sequence aligned elsewhere: 77 GSTM1 haplotypes carry an 18 kb deletion over
// the gene and an 18 kb insertion at its end, and keep the gene. Drawn apart,
// they read as a loss. A net change says nothing about where, so it pairs with
// nothing.
const SHIFT_TOLERANCE = 0.1
const SHIFT_MIN_BP = 1000

export function pairShifts(marks: SiteMark[]) {
  const unpaired = [...marks]
  const shifted: SiteMark[] = []
  const deletions = marks
    .filter(m => m.kind === 'deletion' && m.bp >= SHIFT_MIN_BP && !diffuse(m))
    .sort((a, b) => b.bp - a.bp)
  for (const deletion of deletions) {
    const insertion = unpaired.find(
      m =>
        m.kind === 'insertion' &&
        !diffuse(m) &&
        Math.abs(m.bp - deletion.bp) <=
          SHIFT_TOLERANCE * Math.max(m.bp, deletion.bp) &&
        Math.max(m.start - deletion.end, deletion.start - m.end) <=
          2 * deletion.bp,
    )
    if (insertion) {
      unpaired.splice(unpaired.indexOf(insertion), 1)
      unpaired.splice(unpaired.indexOf(deletion), 1)
      shifted.push({
        site: deletion.site,
        start: Math.min(deletion.start, insertion.start),
        end: Math.max(deletion.end, insertion.end),
        kind: 'shifted',
        bp: deletion.bp,
      })
    }
  }
  return [...unpaired, ...shifted].sort((a, b) => a.start - b.start)
}

export interface StructuralForm {
  // the haplotypes identical at every informative site in the window
  members: string[]
  // what they carry, one character per informative site
  key: string
  // the size changes left once shifted pairs are taken out, largest first, and
  // how many sites it inverts, has no call at, or carries a rare state at where
  // most haplotypes have no call
  deltas: number[]
  inversions: number
  uncalled: number
  rarer: number
  // sites it bypasses on another route through a snarl that calls it
  bypassed: number
  // in window order
  marks: SiteMark[]
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
  // their spans, and how many haplotypes the graph aligns through each: a call
  // that is not a bypass
  informativeSites: { start: number; end: number; aligned: number }[]
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
  // the fewest carriers a state needs to tell a form apart
  minCarriers: number
}

// The forms a window's records group `haplotypes` into.
export function structuralForms(
  records: SvStateRow[],
  haplotypes: string[],
  minCarriers = MIN_CARRIERS,
): StructuralFormsResult {
  const rows = mergeSplitEvents(records)
  const informative: {
    start: number
    end: number
    genotypes: string
    majority: string
    common: Set<string>
    deltas: Map<string, number>
  }[] = []
  const carriesRare = new Set<string>()
  const ranking = (genotypes: string) => {
    const counts = new Map<string, number>()
    for (const state of genotypes) {
      counts.set(state, (counts.get(state) ?? 0) + 1)
    }
    return { counts, ranked: [...counts].sort((a, b) => b[1] - a[1]) }
  }
  // Counted over the records, so a snarl split into one row per size change
  // still counts once per record.
  const nonReferenceMajority = records.filter(
    r => ranking(r.genotypes).ranked[0]![0] !== REFERENCE_STATE,
  ).length
  for (const row of rows) {
    const { counts, ranked } = ranking(row.genotypes)
    const majorityState = ranked[0]![0]
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
        start: row.start,
        end: row.end,
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
  // Over the folded keys, so a site's carriers, also counted over the forms,
  // never pass the haplotypes aligned there: a rare no call folded into a
  // sized majority counts as both.
  const aligned = informative.map(() => 0)
  for (const [key, members] of byKey) {
    for (let i = 0; i < key.length; i++) {
      if (key[i] !== MISSING_STATE && key[i] !== PLACED_STATE) {
        aligned[i]! += members.length
      }
    }
  }
  return {
    sites: records.length,
    informative: informative.length,
    informativeSites: informative.map(({ start, end }, i) => ({
      start,
      end,
      aligned: aligned[i]!,
    })),
    forms: [...byKey]
      .map(([key, members]) => {
        const states = [...informative.keys()].map(i => key.charAt(i))
        const marks = pairShifts(
          states.flatMap(
            (state, i) => siteMark(state, i, informative[i]!) ?? [],
          ),
        )
        return {
          key,
          members,
          deltas: marks
            .flatMap(m =>
              m.kind === 'deletion'
                ? [-m.bp]
                : m.kind === 'insertion'
                  ? [m.bp]
                  : [],
            )
            .sort((a, b) => Math.abs(b) - Math.abs(a)),
          inversions: states.filter(s => s === INVERTED_STATE).length,
          uncalled: states.filter(s => s === MISSING_STATE).length,
          rarer: states.filter(s => s === OTHER_STATE).length,
          bypassed: states.filter(s => s === PLACED_STATE).length,
          marks,
        }
      })
      .sort(
        (a, b) =>
          b.members.length - a.members.length || (a.key < b.key ? -1 : 1),
      ),
    unplaced: [...unplaced],
    rareCarriers: haplotypes.filter(h => carriesRare.has(h)),
    nonReferenceMajority,
    minCarriers,
  }
}
