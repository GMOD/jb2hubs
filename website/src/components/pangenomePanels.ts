// Which haplotypes a locus or region draws as lanes, out of the forms
// `pangenomeSvStates.ts` groups them into.
//
// The lane track can draw any of HPRC's 464 haplotypes, and opening all of
// them is a wall no reader can use. The tutorial's fixed eight are a panel
// someone picked for one locus (the CFHR3-CFHR1 deletion) and mean nothing at
// another. What a reader wants is one lane per way the haplotypes differ
// structurally there, commonest first, each labelled with how many share it.
// The Haplotypes launch opens lanes in proportion to how many haplotypes carry
// each form, so a common structure stacks into a block as tall as its share.
//
// The rule is the same wherever a window comes from: an example on the page, a
// region a reader types and `check-pangenome-launches` all go through here.

import { MIN_CARRIERS, diffuse } from './pangenomeSvStates.ts'

import type {
  SiteMark,
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
  // The form bypasses every site it does not delete and its deletion is at
  // least the window's length, so the graph may have no walk to draw: 4 of
  // SMN's 8 lanes. A shorter deletion leaves a flank, and its lane has to draw
  // (UGT2B17's 120 kb in 150 kb).
  mayDrawEmpty: boolean
  marks: SiteMark[]
}

export const bp = (n: number) =>
  n >= 1_000_000
    ? `${Number((n / 1_000_000).toPrecision(2))} Mb`
    : n >= 1000
      ? `${Number((n / 1000).toPrecision(2))} kb`
      : `${n} bp`

const LISTED_CHANGES = 2

const SIZED_KINDS = new Set(['deletion', 'insertion', 'shifted'])

const sizedMarks = (marks: SiteMark[]) =>
  marks.filter(m => SIZED_KINDS.has(m.kind)).sort((a, b) => b.bp - a.bp)

export const changeName = (m: SiteMark) =>
  m.kind === 'inversion'
    ? 'inversion'
    : m.kind === 'shifted'
      ? `${bp(m.bp)} shifted, same length`
      : diffuse(m)
        ? `${bp(m.bp)} ${m.kind === 'deletion' ? 'shorter' : 'longer'} in ${bp(m.end - m.start)}`
        : `${bp(m.bp)} ${m.kind}`

// A graph cut wider than this is a barcode of SNP bubbles at page width
// (measured 2026-10-14); one change and its flanks read as Bandage draws them.
export const MAX_GRAPH_BP = 40_000
const GRAPH_FLANK_BP = 2000

// The window a form's graph is cut over: its largest change whose place the
// sidecar knows, with a flank either side. Undefined when it has none, or when
// that window would be too wide to read.
export function changeWindow(marks: SiteMark[], chrom: string) {
  const mark = sizedMarks(marks).find(m => !diffuse(m))
  if (!mark) {
    return undefined
  }
  const flank = Math.max(
    GRAPH_FLANK_BP,
    Math.round((mark.end - mark.start) / 10),
  )
  const region = {
    chrom,
    start: Math.max(0, mark.start - flank),
    end: mark.end + flank,
  }
  return region.end - region.start <= MAX_GRAPH_BP
    ? { mark, region }
    : undefined
}

const count = (marks: SiteMark[], kind: SiteMark['kind']) =>
  marks.filter(m => m.kind === kind).length

const sites = (n: number) => `${n} site${n === 1 ? '' : 's'}`

// A form that differs only by taking another route through sites a restored
// parent calls: the parent's residual was under its structural floor, so the
// length is the reference's, but the bases are not GRCh38's path. AMY1 has two.
const anotherRoute = (marks: SiteMark[]) =>
  `another route at ${sites(count(marks, 'bypassed'))}`

// The largest change, for a lane's name, and how many more changes the form
// carries. Empty only for the reference's structure.
export function formLabel(marks: SiteMark[]) {
  const changes = marks.filter(
    m => m.kind !== 'bypassed' && m.kind !== 'uncalled',
  )
  const first =
    sizedMarks(changes)[0] ??
    changes.find(m => m.kind === 'inversion') ??
    changes[0]
  if (!first) {
    return marks.some(m => m.kind === 'uncalled')
      ? 'not aligned'
      : marks.length > 0
        ? anotherRoute(marks)
        : ''
  }
  const name = first.kind === 'rarer' ? 'a rarer change' : changeName(first)
  return changes.length > 1 ? `${name}, ${changes.length - 1} more` : name
}

// How a form differs from the reference. Up to two size changes are listed;
// more are counted with the largest named, since MHC class II's forms carry 38
// and a list of sizes says nothing. The sizes are the sidecar's, already
// rounded to two figures. A deletion spanning nested sites is a size at the
// restored parent's row, so a site with no call left to say is one the graph
// does not carry the haplotype through. A rarer change is a state under
// MIN_CARRIERS at a site where most haplotypes have no call.
export function describeForm({ marks }: Pick<StructuralForm, 'marks'>) {
  const changesBySize = sizedMarks(marks)
  const inversions = count(marks, 'inversion')
  const rarer = count(marks, 'rarer')
  const uncalled = count(marks, 'uncalled')
  const changes = [
    ...(changesBySize.length > LISTED_CHANGES
      ? [
          `${changesBySize.length} size changes, largest a ${changeName(changesBySize[0]!)}`,
        ]
      : changesBySize.map(changeName)),
    ...(inversions > 0
      ? [inversions === 1 ? 'inversion' : `${inversions} inversions`]
      : []),
    ...(rarer > 0
      ? [
          rarer === 1
            ? 'a rarer change at 1 site'
            : `rarer changes at ${rarer} sites`,
        ]
      : []),
    ...(uncalled > 0 ? [`not aligned at ${sites(uncalled)}`] : []),
  ]
  return changes.length > 0
    ? changes.join(', ')
    : marks.length > 0
      ? anotherRoute(marks)
      : 'as the reference'
}

export interface StructuralPanel {
  // structural records in the window
  sites: number
  // those that say something about how these haplotypes differ
  informative: number
  // forms at MIN_CARRIERS or more, whether or not they fit on the panel
  forms: number
  lanes: PanelLane[]
  // LANE_COUNT haplotypes shared out over the forms by how many carry each,
  // every form getting one, and those whose form may draw empty
  laneHaplotypes: string[]
  lanesMayDrawEmpty: string[]
  // haplotypes with no call at any site, which get no lane
  unplaced: number
  // the rest, whom the shares are of, and those with GRCh38's structure
  placed: number
  reference: number
  siteSpans: StructuralFormsResult['informativeSites']
  // every change a form carries, with how many haplotypes carry it over all
  // forms, commonest first
  changes: { mark: SiteMark; carriers: number }[]
}

export const changeKey = (m: SiteMark) => `${m.site}:${m.kind}:${m.bp}`

// The haplotypes aligned at a change's site, whom its carriers are a share of
export const alignedAt = (panel: StructuralPanel, m: SiteMark) =>
  panel.siteSpans[m.site]?.aligned || panel.placed

const COUNTED_KINDS = new Set(['deletion', 'insertion', 'shifted', 'inversion'])

function changesByCarriers(forms: StructuralForm[]) {
  const changes = new Map<string, { mark: SiteMark; carriers: number }>()
  for (const f of forms) {
    for (const mark of f.marks.filter(m => COUNTED_KINDS.has(m.kind))) {
      const change = changes.get(changeKey(mark)) ?? { mark, carriers: 0 }
      change.carriers += f.members.length
      changes.set(changeKey(mark), change)
    }
  }
  return [...changes.values()].sort((a, b) => b.carriers - a.carriers)
}

// Screen height sets both, not load time, which is flat from 8 lanes to 16:
// 8 fit a laptop window, and a complete panel of 10 a 1080p one.
export const PANEL_SIZE = 8
export const COMPLETE_PANEL_SIZE = 10

// Enough lanes that a form one haplotype in ten carries gets three.
export const LANE_COUNT = 32

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
    .sort((a, b) => b.r - a.r || a.i - b.i)
  let left = spare - quota.reduce((n, q) => n + Math.floor(q), 0)
  for (const { i } of byRemainder) {
    if (left-- <= 0) {
      break
    }
    seats[i]!++
  }
  return shown.flatMap((f, i) =>
    [...f.members]
      .sort(
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
// structure, and only HG002's two lack an annotation, so this decides one
// thing: not to open a lane that reads "no annotation" when a member's would
// not.
function representative(members: string[], withoutGenes: ReadonlySet<string>) {
  const sorted = [...members].sort()
  return sorted.find(m => !withoutGenes.has(m)) ?? sorted[0]!
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
  }: {
    size?: number
    completeSize?: number
    withoutGenes?: ReadonlySet<string>
    windowBp?: number
  } = {},
): StructuralPanel | undefined {
  if (result.informative === 0) {
    return undefined
  }
  // A form told apart only by changes under 1% is not a lane of its own; its
  // haplotypes are among the rest.
  const common = result.forms.filter(
    f =>
      f.members.length >= MIN_CARRIERS &&
      (!f.marks.some(m => m.kind === 'rarer') ||
        f.marks.some(m => m.kind !== 'rarer' && m.kind !== 'bypassed')),
  )
  const mayDrawEmpty = (f: StructuralForm) =>
    f.bypassed > 0 &&
    f.deltas.length > 0 &&
    f.deltas.every(d => d < 0) &&
    f.bypassed + f.deltas.length === f.key.length &&
    -f.deltas[0]! >= windowBp
  const lanes = (
    common.length <= completeSize ? common : common.slice(0, size)
  ).map(f => ({
    haplotype: representative(f.members, withoutGenes),
    shares: f.members.length,
    structure: describeForm(f),
    label: formLabel(f.marks),
    mayDrawEmpty: mayDrawEmpty(f),
    marks: f.marks,
  }))
  const laneHaplotypes = allotLanes(common, LANE_COUNT, withoutGenes)
  const empty = new Set(common.filter(mayDrawEmpty).flatMap(f => f.members))
  return {
    sites: result.sites,
    informative: result.informative,
    forms: common.length,
    lanes,
    laneHaplotypes,
    lanesMayDrawEmpty: laneHaplotypes.filter(h => empty.has(h)),
    unplaced: result.unplaced.length,
    placed: result.forms.reduce((n, f) => n + f.members.length, 0),
    reference: result.forms
      .filter(f => f.marks.length === 0)
      .reduce((n, f) => n + f.members.length, 0),
    siteSpans: result.informativeSites,
    changes: changesByCarriers(result.forms),
  }
}

const share = (n: number, of: number) => `${Math.round((100 * n) / of)}%`

// The window in one line: its commonest change, as a share of the haplotypes
// aligned at its site, and the reference's form as a share of those placed.
// A shifted pair is no change to name, so it leads only when nothing else
// does.
export function headline(panel: StructuralPanel, referenceLabel: string) {
  const top =
    panel.changes.find(c => c.mark.kind !== 'shifted') ?? panel.changes[0]
  const parts = [
    ...(top
      ? [
          `Commonest change: ${changeName(top.mark)}, in ${share(top.carriers, alignedAt(panel, top.mark))} of haplotypes aligned there.`,
        ]
      : []),
    `${referenceLabel}'s structure: ${panel.reference === 0 ? 'none' : panel.reference < panel.placed / 100 ? 'under 1%' : share(panel.reference, panel.placed)}.`,
  ]
  return parts.join(' ')
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
