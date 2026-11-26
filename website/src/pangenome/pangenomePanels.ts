// One lane per way a window's haplotypes differ structurally, commonest first,
// out of the forms `pangenomeSvStates.ts` groups them into. The page's
// examples, a typed region and `check-pangenome-launches` all go through here.

import { markTag, sizeTag } from '@gmod/gfa-tabix'

import { drawnChangeOf } from './pangenomeKnownAlleles.ts'
import { diffuse, gains, isChange, sizeOf } from './pangenomeMarks.ts'

import type { KnownAllele } from './pangenomeKnownAlleles.ts'
import type { ChangeMark, FormMark, StateMark } from './pangenomeMarks.ts'
import type { ParsedRegion } from './pangenomeRegion.ts'
import type {
  StructuralForm,
  StructuralFormsResult,
} from './pangenomeSvStates.ts'

interface PanelLane {
  // PanSN prefix, `HG01123#1`, which is how the lane track names a haplotype.
  haplotype: string
  // Haplotypes carrying this form, this one included.
  shares: number
  // How the form differs from the reference, in words, and its largest change
  // for the lane's name.
  structure: string
  label: string
  marks: FormMark[]
}

const LISTED_CHANGES = 2

const SIZED_KINDS = new Set([
  'deletion',
  'insertion',
  'replacement',
  'net',
  'shift',
  'duplication',
])

const sizedMarks = (marks: FormMark[]) =>
  marks
    .filter(m => SIZED_KINDS.has(m.kind))
    .toSorted((a, b) => sizeOf(b) - sizeOf(a))

const STATE_TAGS: Record<StateMark['kind'], string> = {
  uncalled: 'no call',
  rarer: 'rarer',
  bypassed: 'other route',
}

const signedSize = (n: number) => `${n < 0 ? '-' : '+'}${sizeTag(Math.abs(n))}`

// Whether a shift's net change says more than its two-figure size can: a 94
// kb shift 62 bp short is a shift, and one 2.8 kb longer says so
const shiftChanges = (m: ChangeMark) =>
  Math.abs(m.delta) >= 10 ** Math.max(0, Math.floor(Math.log10(sizeOf(m))) - 1)

const tag = (m: ChangeMark) =>
  m.kind === 'net'
    ? `net ${signedSize(m.delta)}`
    : m.kind === 'shift'
      ? `shift ${sizeTag(sizeOf(m))}${shiftChanges(m) ? ` net ${signedSize(m.delta)}` : ''}`
      : markTag({ ...m, kind: m.kind })

// "del 18kb", "repl 32.7kb->58.7kb", "shift 94.2kb": gfa-tabix's markTag, as
// the JBrowse forms track names a change; the page says it in words with
// plainName. A sidecar's mark, which has no state, knows its size change and
// not its route, so a diffuse replacement off one is named net, "net +78kb":
// the bases either side of it say less than its size change.
export const changeName = (m: FormMark) =>
  isChange(m)
    ? tag(m.state === undefined && diffuse(m) ? { ...m, kind: 'net' } : m)
    : STATE_TAGS[m.kind]

const STATE_WORDS: Record<StateMark['kind'], string> = {
  uncalled: 'not aligned',
  rarer: 'rarer change',
  bypassed: 'another route',
}

const spaced = (n: number) => sizeTag(n).replace(/(bp|kb|Mb)$/, ' $1')

const replacedSides = (m: ChangeMark) => [
  spaced(m.refEnd - m.refStart),
  spaced(m.altLength),
]

const shorterOrLonger = (delta: number) =>
  `${spaced(Math.abs(delta))} ${delta < 0 ? 'shorter' : 'longer'}`

const CHANGE_WORDS: Record<ChangeMark['kind'], (m: ChangeMark) => string> = {
  deletion: m => `${spaced(-m.delta)} deletion`,
  insertion: m => `${spaced(m.delta)} insertion`,
  duplication: m => `${spaced(m.delta)} duplication`,
  inversion: m => `${spaced(m.refEnd - m.refStart)} inversion`,
  net: m => shorterOrLonger(m.delta),
  shift: m =>
    tag(m).includes(' net ')
      ? `${spaced(sizeOf(m))} realigned, ${shorterOrLonger(m.delta)}`
      : `${spaced(sizeOf(m))} realigned`,
  replacement: m => replacedSides(m).join(' → '),
}

const wordKind = (m: ChangeMark) =>
  m.state === undefined && diffuse(m) ? 'net' : m.kind

// A change in words for the page, where changeName's tags read as code: "18.4
// kb deletion", "12 kb → 2.01 kb", "240 kb shorter", "94.2 kb realigned". The
// JBrowse forms track keeps changeName's.
export const plainName = (m: FormMark) =>
  isChange(m) ? CHANGE_WORDS[wordKind(m)](m) : STATE_WORDS[m.kind]

const GRAPH_FLANK_BP = 2000

// The window a form's own graph is cut over, where the whole window's is too
// large to draw: its largest change whose place the sidecar knows, else an
// inversion, with a flank either side. Undefined when it has neither.
export function changeWindow(marks: FormMark[], chrom: string) {
  const mark =
    sizedMarks(marks).find(m => !diffuse(m)) ??
    marks.find(m => m.kind === 'inversion')
  const flank = mark
    ? Math.max(GRAPH_FLANK_BP, Math.round((mark.end - mark.start) / 10))
    : 0
  const region: ParsedRegion | undefined = mark && {
    chrom,
    start: Math.max(0, mark.start - flank),
    end: mark.end + flank,
  }
  return mark && region ? { mark, region } : undefined
}

// The row lit in the graph before any is clicked: the commonest that carries a
// cited allele, else the commonest with a change the graph can place. CFH /
// CFHR opened on a change 1% carry under a card about a deletion 30% carry.
export function graphRow(
  panel: Pick<StructuralPanel, 'rows' | 'alleleNames'>,
  chrom: string,
) {
  const drawable = panel.rows.filter(
    r => r.haplotype !== undefined && changeWindow(r.marks, chrom),
  )
  return (
    drawable.find(r =>
      r.marks.some(m => panel.alleleNames[changeKey(m)] !== undefined),
    ) ?? drawable[0]
  )
}

const changesIn = (marks: FormMark[]) =>
  marks.filter(m => m.kind !== 'bypassed' && m.kind !== 'uncalled')

// A form whose haplotypes the graph does not align here, which no launch can
// show.
export const notAligned = (marks: FormMark[]) =>
  changesIn(marks).length === 0 && marks.some(m => m.kind === 'uncalled')

// A form's changes, largest first, then those with no size: a site it has no
// call at is one the graph does not carry the haplotype through, and a rarer
// change a state too rare to tell a form apart, which in the callset is a call
// where most have none and in the walks one that agrees with no common state.
// A form that only bypasses sites takes another route through a snarl a
// restored parent calls: the reference's length on another path (AMY1 has
// two). A cited allele comes first, so a form is named by the allele the
// page's story tells of.
function namedMarks(marks: FormMark[], cited = noneCited) {
  const named = [
    ...sizedMarks(marks),
    ...marks.filter(m => m.kind === 'inversion'),
    ...marks.filter(m => m.kind === 'rarer'),
    ...marks.filter(m => m.kind === 'uncalled'),
  ]
  return named.length > 0
    ? [...named.filter(cited), ...named.filter(m => !cited(m))]
    : marks.slice(0, 1)
}

const noneCited = (_: FormMark) => false

const tokens = (
  marks: FormMark[],
  name: (m: FormMark) => string,
  cited = noneCited,
) => namedMarks(marks, cited).map(name)

// The largest change, or a cited allele, for a lane's name, with ` +N` for the
// rest, as the JBrowse forms track names it. Empty only for the reference's
// structure.
export function formLabel(
  marks: FormMark[],
  name = changeName,
  more = '',
  cited = noneCited,
) {
  const [head, ...rest] = tokens(marks, name, cited)
  return head === undefined
    ? ''
    : rest.length > 0
      ? `${head} +${rest.length}${more}`
      : head
}

// How a form differs from the reference: its largest changes, the rest
// counted, since MHC class II's forms carry 38 and a list of sizes says
// nothing.
export function describeForm(
  { marks }: Pick<StructuralForm, 'marks'>,
  name = changeName,
  more = '',
  cited = noneCited,
) {
  const all = tokens(marks, name, cited)
  const listed = all.slice(0, LISTED_CHANGES)
  return all.length === 0
    ? 'ref'
    : all.length > listed.length
      ? `${listed.join(', ')} +${all.length - listed.length}${more}`
      : listed.join(', ')
}

// A row of the page's map: the forms that differ only by changes under a tenth
// of their largest, drawn as what they all carry.
export interface PanelRow {
  // The haplotype that stands for the row. A reference row no common form has
  // stands for none.
  haplotype?: string
  shares: number
  forms: number
  structure: string
  label: string
  marks: FormMark[]
}

export interface StructuralPanel {
  // forms with enough carriers to tell apart, whether or not they fit on the
  // panel
  forms: number
  lanes: PanelLane[]
  // the reference's structure first, then the commonest
  rows: PanelRow[]
  // LANE_COUNT haplotypes shared out over the forms by how many carry each,
  // every form getting one
  laneHaplotypes: string[]
  // how many haplotypes carry each lane haplotype's form, itself included
  laneAlike: Record<string, number>
  // Those whose form bypasses every site it does not delete, with a deletion
  // at least the window's length, so the graph may have no walk to draw. A
  // walk reading has no bypassed sites and never sets it.
  lanesMayDrawEmpty: string[]
  // haplotypes with no call at any site, which get no lane
  unplaced: number
  // the rest, whom the shares are of, those with GRCh38's structure, and those
  // whose only change is a stretch shifted at the same length
  placed: number
  reference: number
  shiftedOnly: number
  siteSpans: StructuralFormsResult['informativeSites']
  // every change a form carries, with the haplotypes that carry it over all
  // forms, commonest first, and how many carry it or a `similar` change
  changes: {
    mark: FormMark
    carriers: number
    members: string[]
    similarCarriers: number
  }[]
  // A known allele's name for each change that is one, by `changeKey`.
  alleleNames: Record<string, string>
}

// What the page calls a change: a known allele's name where it is one.
export const nameChange = (
  panel: Pick<StructuralPanel, 'alleleNames'>,
  m: FormMark,
) => panel.alleleNames[changeKey(m)] ?? plainName(m)

// An inversion gains and loses nothing, so its size is the stretch it turns.
const extent = (m: FormMark) =>
  isChange(m) && m.kind === 'inversion' ? m.refEnd - m.refStart : sizeOf(m)

export const changeKey = (m: FormMark) =>
  [
    m.site,
    m.kind,
    `${gains(m) ? '+' : ''}${extent(m)}`,
    isChange(m) ? m.state : undefined,
  ].join(':')

// The haplotypes aligned at a change's site, whom its carriers are a share of
export const alignedAt = (panel: StructuralPanel, m: FormMark) =>
  (panel.siteSpans[m.site]?.aligned ?? 0) || panel.placed

const COUNTED_KINDS = new Set([
  'deletion',
  'insertion',
  'replacement',
  'net',
  'shift',
  'inversion',
  'duplication',
])

// One change sized twice: the same kind, sizes within 10%, overlapping sites.
// GSTT1's insertion is 54 kb on 190 haplotypes and 55 kb on 20. A net change
// is never similar to another, since copy numbers a repeat apart chain:
// AMY1's rare 190 kb gain read as common. A replacement's direction is part
// of it, while a shift's few bases of net change are not: AMY1's 94.2 kb
// shift is one change on 187 haplotypes, 15 of them 2.8 kb longer.
export const similar = (a: FormMark, b: FormMark) =>
  changeKey(a) === changeKey(b) ||
  (!diffuse(a) &&
    !diffuse(b) &&
    a.kind === b.kind &&
    (a.kind !== 'replacement' || gains(a) === gains(b)) &&
    Math.abs(sizeOf(a) - sizeOf(b)) <= 0.1 * Math.max(sizeOf(a), sizeOf(b)) &&
    a.start <= b.end &&
    b.start <= a.end)

function changesByCarriers(forms: StructuralForm[]) {
  const changes = new Map<string, { mark: FormMark; members: Set<string> }>()
  for (const f of forms) {
    for (const mark of f.marks.filter(m => COUNTED_KINDS.has(m.kind))) {
      const change = changes.get(changeKey(mark)) ?? {
        mark,
        members: new Set<string>(),
      }
      for (const member of f.members) {
        change.members.add(member)
      }
      changes.set(changeKey(mark), change)
    }
  }
  return [...changes.values()]
    .map(c => ({
      mark: c.mark,
      members: [...c.members],
      carriers: c.members.size,
      similarCarriers: forms
        .filter(f => f.marks.some(m => similar(m, c.mark)))
        .reduce((n, f) => n + f.members.length, 0),
    }))
    .toSorted((a, b) => b.carriers - a.carriers)
}

// Screen height sets both, not load time, which is flat from 8 lanes to 16:
// 8 fit a laptop window, and a complete panel of 10 a 1080p one.
export const PANEL_SIZE = 8
export const COMPLETE_PANEL_SIZE = 10

// Enough lanes that a form one haplotype in ten carries gets three.
const LANE_COUNT = 32

// One lane per form, then the rest of `size` by largest remainder over the
// forms' carriers, so the seats add up to `size` and none is empty. A form
// has no more lanes than members.
export function allotLanes(
  forms: Pick<StructuralForm, 'members'>[],
  size: number,
  withoutGenes: ReadonlySet<string>,
) {
  const shown = forms.slice(0, size)
  const total = shown.reduce((n, f) => n + f.members.length, 0)
  const spare = size - shown.length
  const quota = shown.map(f => (spare * f.members.length) / total)
  const seats = quota.map(q => 1 + Math.floor(q))
  const byRemainder = quota
    .map((q, i) => ({ i, r: q - Math.floor(q) }))
    .toSorted((a, b) => b.r - a.r || a.i - b.i)
  let left = spare - quota.reduce((n, q) => n + Math.floor(q), 0)
  for (const { i } of byRemainder) {
    if (left-- <= 0) {
      break
    }
    seats[i]!++
  }
  return shown.flatMap((f, i) =>
    [...f.members]
      .toSorted(
        (a, b) =>
          Number(withoutGenes.has(a)) - Number(withoutGenes.has(b)) ||
          (a < b ? -1 : 1),
      )
      .slice(0, seats[i]),
  )
}

// The haplotype that stands for its form: the alphabetically first whose lane
// would draw gene models, else the alphabetically first, so a rerun over the
// same sidecar names the same lanes. Any member of a form draws the same
// structure, so this decides one thing: not to open a lane that reads "no
// annotation" when a member's would not.
function representative(members: string[], withoutGenes: ReadonlySet<string>) {
  const sorted = members.toSorted()
  return sorted.find(m => !withoutGenes.has(m)) ?? sorted[0]!
}

// How far apart two changes of one kind and size may be placed and still be
// one change to a row, as a share of their size. PGA's 18.7 kb insertion sits
// at two points a few hundred bp apart before PGA5, a tandem copy's alignment
// placing it either way, and drew three rows of one name.
const PLACED_SLACK = 0.1

const placedAlike = (a: FormMark, b: FormMark) => {
  const slack = PLACED_SLACK * Math.max(sizeOf(a), sizeOf(b))
  return (
    !diffuse(a) &&
    !diffuse(b) &&
    a.kind === b.kind &&
    a.kind !== 'inversion' &&
    (a.kind !== 'replacement' || gains(a) === gains(b)) &&
    Math.abs(sizeOf(a) - sizeOf(b)) <= slack &&
    a.start <= b.end + slack &&
    b.start <= a.end + slack
  )
}

// Each change's key for telling rows apart: that of the commonest change it
// is placed and sized alike with, itself where it is the commonest. A change
// joins a lead and never another joiner, so sizes a repeat apart do not chain.
function alikeKeys(forms: StructuralForm[]) {
  const carriers = new Map<string, { mark: FormMark; n: number }>()
  for (const f of forms) {
    for (const mark of f.marks.filter(isChange)) {
      const key = changeKey(mark)
      const held = carriers.get(key)
      carriers.set(key, { mark, n: (held?.n ?? 0) + f.members.length })
    }
  }
  const leads: { key: string; mark: FormMark }[] = []
  const keys = new Map<string, string>()
  for (const [key, { mark }] of [...carriers].toSorted(
    (a, b) => b[1].n - a[1].n,
  )) {
    const lead = leads.find(l => placedAlike(l.mark, mark))
    keys.set(key, lead?.key ?? key)
    if (!lead) {
      leads.push({ key, mark })
    }
  }
  return keys
}

const MAJOR_SHARE = 0.1

interface RowNaming {
  name: (m: FormMark) => string
  cited: (m: FormMark) => boolean
  // A cited allele is one change however it is sized: GSTT1's gene is a 54 kb
  // insertion on 190 haplotypes and 55 kb on 20.
  same: (m: FormMark) => string
}

// What a form's row is told apart by: a cited allele, and each change at least
// a tenth the size of its largest. Mouse Agouti's five forms carry one 15 kb
// deletion and differ by insertions under 1 kb, and cattle KIT's eight drew
// seven rows named "fewer KIT repeats".
function rowKey(f: StructuralForm, { cited, same }: RowNaming) {
  const changes = f.marks.filter(isChange)
  const floor = MAJOR_SHARE * Math.max(0, ...changes.map(extent))
  return changes.length > 0
    ? changes
        .filter(m => cited(m) || extent(m) >= floor)
        .map(same)
        .toSorted()
        .join(' ')
    : f.marks.map(m => `${m.site}:${m.kind}`).join(' ')
}

function panelRows(
  common: StructuralForm[],
  reference: number,
  {
    size,
    completeSize,
    withoutGenes,
    naming,
  }: {
    size: number
    completeSize: number
    withoutGenes: ReadonlySet<string>
    naming: RowNaming
  },
): PanelRow[] {
  const { name, cited, same } = naming
  const groups = new Map<string, StructuralForm[]>()
  for (const f of common) {
    const key = rowKey(f, naming)
    groups.set(key, [...(groups.get(key) ?? []), f])
  }
  const rows = [...groups.values()]
    .flatMap(forms => {
      const [lead, ...rest] = forms
      const marks = (lead?.marks ?? []).filter(m =>
        rest.every(f => f.marks.some(o => same(o) === same(m))),
      )
      return lead
        ? [
            {
              haplotype: representative(lead.members, withoutGenes),
              shares: forms.reduce((n, f) => n + f.members.length, 0),
              forms: forms.length,
              structure: describeForm({ marks }, name, ' more', cited),
              label: formLabel(marks, name, ' more', cited),
              marks,
            },
          ]
        : []
    })
    .toSorted((a, b) => b.shares - a.shares)
  const others = rows.filter(r => r.marks.length > 0)
  const shown =
    others.length < completeSize ? others : others.slice(0, size - 1)
  const named = (label: string) => shown.filter(r => r.label === label).length
  return [
    rows.find(r => r.marks.length === 0) ?? {
      shares: reference,
      forms: 0,
      structure: 'ref',
      label: '',
      marks: [],
    },
    // two rows of one name are told apart by their second change
    ...shown.map(r => (named(r.label) > 1 ? { ...r, label: r.structure } : r)),
  ]
}

// One lane per form a meaningful share of haplotypes carry, largest first: all
// of them where a window has few, else the largest `size`. Undefined where
// nothing in the window tells the haplotypes apart, which is what a locus with
// no structural variation looks like and is not a panel.
//
// A haplotype with no call at any site is in no form and gets no lane: no snarl
// in the window carries it, so the lane would draw empty. On chrX those are the
// 116 male haplotypes without one.
export function structuralPanel(
  result: StructuralFormsResult,
  {
    size = PANEL_SIZE,
    completeSize = COMPLETE_PANEL_SIZE,
    withoutGenes = new Set<string>(),
    windowBp = 0,
    alleles = [],
  }: {
    size?: number
    completeSize?: number
    withoutGenes?: ReadonlySet<string>
    windowBp?: number
    alleles?: readonly KnownAllele[]
  } = {},
): StructuralPanel | undefined {
  if (result.informative === 0) {
    return undefined
  }
  // A form told apart only by changes under 1% is not a lane of its own, and
  // the walks' `other` form has no structure to draw; their haplotypes are
  // among the rest.
  const common = result.forms.filter(
    f =>
      !f.other &&
      f.members.length >= result.minCarriers &&
      (!f.marks.some(m => m.kind === 'rarer') ||
        f.marks.some(m => m.kind !== 'rarer' && m.kind !== 'bypassed')),
  )
  const mayDrawEmpty = (f: StructuralForm) =>
    f.bypassed > 0 &&
    f.deltas.length > 0 &&
    f.deltas.every(d => d < 0) &&
    f.bypassed + f.deltas.length === f.key.length &&
    -f.deltas[0]! >= windowBp
  const alleleNames = Object.fromEntries(
    result.forms.flatMap(f =>
      f.marks.flatMap(m => {
        const known = drawnChangeOf(m, alleles)
        return known ? [[changeKey(m), known.drawn.label]] : []
      }),
    ),
  )
  const name = (m: FormMark) => nameChange({ alleleNames }, m)
  const alike = alikeKeys(common)
  const cited = (m: FormMark) => alleleNames[changeKey(m)] !== undefined
  const lanes = (
    common.length <= completeSize ? common : common.slice(0, size)
  ).map(f => ({
    haplotype: representative(f.members, withoutGenes),
    shares: f.members.length,
    structure: describeForm(f, name, ' more', cited),
    label: formLabel(f.marks, name, ' more', cited),
    marks: f.marks,
  }))
  const laneHaplotypes = allotLanes(common, LANE_COUNT, withoutGenes)
  const seated = new Set(laneHaplotypes)
  const empty = new Set(common.filter(mayDrawEmpty).flatMap(f => f.members))
  const reference = result.forms
    .filter(f => !f.other && f.marks.length === 0)
    .reduce((n, f) => n + f.members.length, 0)
  return {
    forms: common.length,
    lanes,
    rows: panelRows(common, reference, {
      size,
      completeSize,
      withoutGenes,
      naming: {
        name,
        cited,
        same: m =>
          alleleNames[changeKey(m)] ?? alike.get(changeKey(m)) ?? changeKey(m),
      },
    }),
    laneHaplotypes,
    laneAlike: Object.fromEntries(
      common.flatMap(f =>
        f.members.filter(m => seated.has(m)).map(m => [m, f.members.length]),
      ),
    ),
    lanesMayDrawEmpty: laneHaplotypes.filter(h => empty.has(h)),
    unplaced: result.unplaced.length,
    placed: result.forms.reduce((n, f) => n + f.members.length, 0),
    reference,
    shiftedOnly: result.forms
      .filter(
        f =>
          f.onlyShifts ??
          (f.marks.length > 0 && f.marks.every(m => m.kind === 'shift')),
      )
      .reduce((n, f) => n + f.members.length, 0),
    siteSpans: result.informativeSites,
    changes: changesByCarriers(result.forms),
    alleleNames,
  }
}

export interface LaneConfig {
  tracks: {
    trackId: string
    type: string
    assemblyNames: string[]
    adapter: {
      assemblyNames?: string[]
      assemblyNameToPanSN?: Record<string, string | undefined>
    }
  }[]
}

// The haplotypes whose lanes draw gene models: those the lane track maps to an
// assembly that a feature track in the config annotates alone. That is the
// test `MultiWaySyntenyDisplay` applies when it looks for a lane's genes, so a
// haplotype outside this set draws its alignment with "no annotation" beside
// it.
export function annotatedHaplotypes(config: LaneConfig, laneTrackId: string) {
  const lanes = config.tracks.find(t => t.trackId === laneTrackId)
  const anchor = lanes?.adapter.assemblyNames?.[0]
  const annotated = new Set(
    config.tracks
      .filter(t => t.type === 'FeatureTrack' && t.assemblyNames.length === 1)
      .map(t => t.assemblyNames[0]),
  )
  return new Set(
    Object.entries(lanes?.adapter.assemblyNameToPanSN ?? {}).flatMap(
      ([assembly, haplotype]) =>
        haplotype && assembly !== anchor && annotated.has(assembly)
          ? [haplotype]
          : [],
    ),
  )
}
