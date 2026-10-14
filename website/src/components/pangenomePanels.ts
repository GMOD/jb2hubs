// Which haplotypes a locus or region draws as lanes, out of the forms
// `pangenomeSvStates.ts` groups them into.
//
// The GBZ lane track can draw any of HPRC's 464 haplotypes, and opening all of
// them is a wall no reader can use. The tutorial's fixed eight are a panel
// someone picked for one locus (the CFHR3-CFHR1 deletion) and mean nothing at
// another. What a reader wants is one lane per way the haplotypes differ
// structurally there, commonest first, each labelled with how many share it.
//
// The rule is the same wherever a window comes from: an example on the page, a
// region a reader types and `check-pangenome-launches` all go through here.

import { MIN_CARRIERS } from './pangenomeSvStates.ts'

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

// A size change at a site far wider than itself says how much shorter or longer
// a route through the site is, not where: SMN's restored 1.6 Mb parent has
// routes 240 kb shorter, while SMN1 itself is lost on 1–2% of haplotypes.
const DIFFUSE_MIN_SPAN = 10_000

export const diffuse = (m: SiteMark) =>
  (m.kind === 'deletion' || m.kind === 'insertion') &&
  m.end - m.start > Math.max(2 * m.bp, DIFFUSE_MIN_SPAN)

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

const count = (marks: SiteMark[], kind: SiteMark['kind']) =>
  marks.filter(m => m.kind === kind).length

// The largest change, for a lane's name, and how many more the form carries.
// Empty for the reference's structure.
export function formLabel(marks: SiteMark[]) {
  const shown = marks.filter(m => m.kind !== 'bypassed')
  const first =
    sizedMarks(shown)[0] ??
    shown.find(m => m.kind === 'inversion') ??
    shown.find(m => m.kind === 'rarer') ??
    shown[0]
  if (!first) {
    return ''
  }
  const name =
    first.kind === 'inversion'
      ? 'inversion'
      : first.kind === 'rarer'
        ? 'a rarer change'
        : first.kind === 'uncalled'
          ? 'not aligned'
          : changeName(first)
  return shown.length > 1 ? `${name} +${shown.length - 1}` : name
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
    ...(uncalled > 0
      ? [`not aligned at ${uncalled} site${uncalled === 1 ? '' : 's'}`]
      : []),
  ]
  return changes.length === 0 ? 'as the reference' : changes.join(', ')
}

export interface StructuralPanel {
  // structural records in the window
  sites: number
  // those that say something about how these haplotypes differ
  informative: number
  // forms at MIN_CARRIERS or more, whether or not they fit on the panel
  forms: number
  lanes: PanelLane[]
  // haplotypes with no call at any site, which get no lane
  unplaced: number
  // the rest, whom the shares are of
  placed: number
  siteSpans: StructuralFormsResult['informativeSites']
  // every change a form carries, with how many haplotypes carry it over all
  // forms, commonest first
  changes: { mark: SiteMark; carriers: number }[]
}

export const changeKey = (m: SiteMark) => `${m.site}:${m.kind}:${m.bp}`

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
  const common = result.forms.filter(f => f.members.length >= MIN_CARRIERS)
  const lanes = (
    common.length <= completeSize ? common : common.slice(0, size)
  ).map(f => ({
    haplotype: representative(f.members, withoutGenes),
    shares: f.members.length,
    structure: describeForm(f),
    label: formLabel(f.marks),
    mayDrawEmpty:
      f.bypassed > 0 &&
      f.deltas.length > 0 &&
      f.deltas.every(d => d < 0) &&
      f.bypassed + f.deltas.length === f.key.length &&
      -f.deltas[0]! >= windowBp,
    marks: f.marks,
  }))
  return {
    sites: result.sites,
    informative: result.informative,
    forms: common.length,
    lanes,
    unplaced: result.unplaced.length,
    placed: result.forms.reduce((n, f) => n + f.members.length, 0),
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
  const reference = panel.lanes.find(l => l.label === '')
  const parts = [
    ...(top
      ? [
          `Commonest change: ${changeName(top.mark)}, in ${share(top.carriers, panel.siteSpans[top.mark.site]?.aligned || panel.placed)} of haplotypes aligned there.`,
        ]
      : []),
    `${referenceLabel}'s structure: ${reference ? share(reference.shares, panel.placed) : 'under 1%'}.`,
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
