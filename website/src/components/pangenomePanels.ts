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
  StructuralForm,
  StructuralFormsResult,
} from './pangenomeSvStates.ts'

export interface PanelLane {
  // PanSN prefix, `HG01123#1`, which is how the lane track names a haplotype.
  haplotype: string
  // Haplotypes carrying this form, this one included.
  shares: number
  // How the form differs from the reference, in words.
  structure: string
  // The form bypasses every site it does not delete and its deletion is at
  // least the window's length, so the graph may have no walk to draw: 4 of
  // SMN's 8 lanes. A shorter deletion leaves a flank, and its lane has to draw
  // (UGT2B17's 120 kb in 150 kb).
  mayDrawEmpty: boolean
}

const bp = (n: number) =>
  n >= 1000 ? `${Number((n / 1000).toPrecision(2))} kb` : `${n} bp`

const LISTED_CHANGES = 2

const sized = (delta: number) =>
  `${bp(Math.abs(delta))} ${delta < 0 ? 'deletion' : 'insertion'}`

// How a form differs from the reference. Up to two size changes are listed;
// more are counted with the largest named, since MHC class II's forms carry 38
// and a list of sizes says nothing. The sizes are the sidecar's, already
// rounded to two figures. A deletion spanning nested sites is a size at the
// restored parent's row, so a site with no call left to say is one the graph
// does not carry the haplotype through. A rarer change is a state under
// MIN_CARRIERS at a site where most haplotypes have no call.
export function describeForm(
  form: Pick<StructuralForm, 'deltas' | 'inversions' | 'uncalled' | 'rarer'>,
) {
  const { deltas, inversions, uncalled, rarer } = form
  const changes = [
    ...(deltas.length > LISTED_CHANGES
      ? [`${deltas.length} size changes, largest a ${sized(deltas[0]!)}`]
      : deltas.map(sized)),
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
    mayDrawEmpty:
      f.bypassed > 0 &&
      f.deltas.length > 0 &&
      f.deltas.every(d => d < 0) &&
      f.bypassed + f.deltas.length === f.key.length &&
      -f.deltas[0]! >= windowBp,
  }))
  return {
    sites: result.sites,
    informative: result.informative,
    forms: common.length,
    lanes,
    unplaced: result.unplaced.length,
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
