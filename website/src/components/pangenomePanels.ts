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

import { MIN_CARRIERS, MISSING_STATE } from './pangenomeSvStates.ts'

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
}

const bp = (n: number) =>
  n >= 1000 ? `${Number((n / 1000).toPrecision(2))} kb` : `${n} bp`

const LISTED_CHANGES = 2

const sized = (delta: number) =>
  `${bp(Math.abs(delta))} ${delta < 0 ? 'deletion' : 'insertion'}`

// How a form differs from the reference. Up to two size changes are listed;
// more are counted with the largest named, since MHC class II's forms carry 38
// and a list of sizes says nothing. The sizes are the sidecar's, already
// rounded to two figures. A site with no call is one the haplotype's path
// skips: a deletion spanning it, or a haplotype the graph does not place there.
// The sidecar cannot tell which, and the reference bases under the skipped
// sites are no deletion size either: UGT2B17's whole-gene deletion skips 8
// sites that cover 9.6 kb.
export function describeForm(
  form: Pick<StructuralForm, 'deltas' | 'inversions' | 'uncalled'>,
) {
  const { deltas, inversions, uncalled } = form
  const changes = [
    ...(deltas.length > LISTED_CHANGES
      ? [`${deltas.length} size changes, largest a ${sized(deltas[0]!)}`]
      : deltas.map(sized)),
    ...(inversions > 0
      ? [inversions === 1 ? 'inversion' : `${inversions} inversions`]
      : []),
    ...(uncalled > 0
      ? [`skips ${uncalled} site${uncalled === 1 ? '' : 's'}`]
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
  // haplotypes left off the panel for having no call at any site
  uncalled: number
}

// Screen height sets both, not load time, which is flat from 8 lanes to 16:
// 8 fit a laptop window, and a complete panel of 10 a 1080p one.
export const PANEL_SIZE = 8
export const COMPLETE_PANEL_SIZE = 10

// The haplotype that stands for its form: the alphabetically first whose lane
// would draw gene models, else the alphabetically first, so a rerun over the
// same sidecar names the same lanes. Any member of a form with a call draws the
// same structure, and only HG002's two lack an annotation, so this decides one
// thing: not to open a lane that reads "no annotation" when a member's would
// not. A form with no call in the window can hold haplotypes the graph does not
// place there at all, which nothing here can see; agent-docs/reference/PANGENOME_PORTAL.md has the
// measurement.
function representative(members: string[], withoutGenes: ReadonlySet<string>) {
  const sorted = [...members].sort()
  return sorted.find(m => !withoutGenes.has(m)) ?? sorted[0]!
}

// One lane per form a meaningful share of haplotypes carry, largest first: all
// of them where a window has few, else the largest `size`. Undefined where
// nothing in the window tells the haplotypes apart, which is what a locus with
// no structural variation looks like and is not a panel.
//
// `withoutUncalled` leaves out the form with no call at any informative site.
// The sidecar cannot tell a deletion spanning the window from a haplotype the
// graph does not place there, so the form normally stays; on a chromosome half
// the male haplotypes lack, it is 116 of HPRC's 462 in every window, and its
// lane draws empty.
export function structuralPanel(
  result: StructuralFormsResult,
  {
    size = PANEL_SIZE,
    completeSize = COMPLETE_PANEL_SIZE,
    withoutGenes = new Set<string>(),
    withoutUncalled = false,
  }: {
    size?: number
    completeSize?: number
    withoutGenes?: ReadonlySet<string>
    withoutUncalled?: boolean
  } = {},
): StructuralPanel | undefined {
  if (result.informative === 0) {
    return undefined
  }
  const uncalled = withoutUncalled
    ? result.forms.find(f => f.key === MISSING_STATE.repeat(f.key.length))
    : undefined
  const common = result.forms.filter(
    f => f !== uncalled && f.members.length >= MIN_CARRIERS,
  )
  const lanes = (
    common.length <= completeSize ? common : common.slice(0, size)
  ).map(f => ({
    haplotype: representative(f.members, withoutGenes),
    shares: f.members.length,
    structure: describeForm(f),
  }))
  return {
    sites: result.sites,
    informative: result.informative,
    forms: common.length,
    lanes,
    uncalled: uncalled?.members.length ?? 0,
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
