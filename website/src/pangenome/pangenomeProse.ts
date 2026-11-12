// The page's wording of an answer: its sizes and shares, the headline, the
// sentence that says what a reading found, and who carries a known allele.

import { sizeOf } from './pangenomeMarks.ts'
import { alignedAt, changeKey, nameChange, similar } from './pangenomePanels.ts'
import { formatRegion } from './pangenomeRegion.ts'

import type { Reading, RegionAnswer } from './pangenomeAnswer.ts'
import type { PangenomeDataset } from './pangenomeDataset.ts'
import type { KnownAllele } from './pangenomeKnownAlleles.ts'
import type { FormMark } from './pangenomeMarks.ts'
import type { StructuralPanel } from './pangenomePanels.ts'

export const bp = (n: number) =>
  n >= 1_000_000
    ? `${Number((n / 1_000_000).toPrecision(2))} Mb`
    : n >= 1000
      ? `${Number((n / 1000).toPrecision(2))} kb`
      : `${n} bp`

export const steps = (n: number) =>
  n >= 1000 ? `${Number((n / 1000).toPrecision(2))} k` : `${n}`

// One share format for the page: a nonzero share under 1% reads "<1%".
export const percent = (n: number, of: number) =>
  n > 0 && n < of / 100 ? '<1%' : `${Math.round((100 * n) / of)}%`

// A change at least this share of the haplotypes aligned at its site carry is
// common enough to lead the headline.
const COMMON_SHARE = 0.05

// The window in one line: its largest common change, as a share of the
// haplotypes aligned at its site, and the reference's form as a share of those
// placed. The largest leads because AMY1's commonest was a 79 bp deletion
// beside a 94 kb one, and a shifted pair leads only when nothing else does.
// Under a known allele's card, which counts its carriers, a lead that is that
// allele goes unsaid: HP's "Hp1, in 41%" repeated the card's "Hp1: 188 of 462
// (41%)" one line down.
export function headline(
  panel: StructuralPanel,
  referenceLabel: string,
  { allelesCounted = false } = {},
) {
  const named = panel.changes.filter(c => c.mark.kind !== 'shift')
  const alignedAtAny = (m: FormMark) =>
    Math.max(
      ...named
        .filter(c => similar(c.mark, m))
        .map(c => alignedAt(panel, c.mark)),
    )
  const largest = named
    .filter(c => c.similarCarriers >= COMMON_SHARE * alignedAtAny(c.mark))
    .toSorted((a, b) => sizeOf(b.mark) - sizeOf(a.mark))[0]
  const lead =
    largest &&
    named
      .filter(c => similar(c.mark, largest.mark))
      .toSorted((a, b) => b.carriers - a.carriers)[0]
  const top = lead ?? named[0] ?? panel.changes[0]
  const said =
    top && !(allelesCounted && panel.alleleNames[changeKey(top.mark)])
  const shifted =
    panel.shiftedOnly > 0
      ? `its length with a stretch aligned elsewhere: ${percent(panel.shiftedOnly, panel.placed)}`
      : ''
  return [
    ...(said
      ? [
          lead
            ? `Largest common change: ${nameChange(panel, lead.mark)}, in ${percent(lead.similarCarriers, alignedAtAny(lead.mark))} of haplotypes aligned there.`
            : `Commonest change: ${nameChange(panel, top.mark)}, in ${percent(top.carriers, alignedAt(panel, top.mark))} of haplotypes aligned there.`,
        ]
      : []),
    panel.reference === 0
      ? `No haplotype here has ${referenceLabel}'s structure${shifted ? `; ${shifted}` : ''}.`
      : `${referenceLabel}'s structure: ${panel.reference < panel.placed / 100 ? 'under 1%' : percent(panel.reference, panel.placed)}${shifted ? `, and ${shifted}` : ''}.`,
  ].join(' ')
}

const count = (n: number, noun: string) =>
  `${n.toLocaleString('en-US')} ${noun}${n === 1 ? '' : 's'}`

export function readingSentence(reading: Reading, referenceLabel: string) {
  const { haplotypes, panel, sites } = reading
  const whose = reading.source === 'walks' ? "graph's" : "callset's"
  const rare =
    reading.rareCarriers > 0
      ? ` ${count(reading.rareCarriers, 'haplotype')} also ${reading.rareCarriers === 1 ? 'carries' : 'carry'} something rarer.`
      : ''
  if (panel) {
    const shown =
      panel.lanes.length < panel.forms
        ? `, the ${panel.lanes.length} commonest below`
        : ''
    const unplaced =
      panel.unplaced > 0
        ? ` ${count(panel.unplaced, 'haplotype')} ${panel.unplaced === 1 ? 'is' : 'are'} not aligned at ${sites === 1 ? 'it' : 'any of them'} and ${panel.unplaced === 1 ? 'has' : 'have'} no lane.`
        : ''
    return `${count(sites, 'structural variant site')} ${sites === 1 ? 'sorts' : 'sort'} the ${whose} ${haplotypes} haplotypes into ${count(panel.forms, 'form')} that 1% or more carry${shown}.${rare}${unplaced}`
  }
  const agree =
    reading.nonReferenceMajority > 0
      ? `The ${whose} ${haplotypes} haplotypes share one structure here, which differs from ${referenceLabel} at ${count(reading.nonReferenceMajority, 'site')}.`
      : `The ${whose} ${haplotypes} haplotypes share ${referenceLabel}'s structure here.`
  return `${agree}${rare}`
}

// A panel this small names its carriers; a larger one counts them.
const NAMED_PANEL_MAX = 30

// A haplotype as a reader knows it: cattle by breed, mouse strains with the
// slash the sidecar's names cannot hold.
const haplotypeName = (dataset: PangenomeDataset, h: string) =>
  dataset.graphVcf?.rows?.labels[h] ??
  h.replace(/_T2T$/, ' (T2T)').replaceAll('_', '/')

function nameList(names: string[]) {
  return names.length <= 2
    ? names.join(' and ')
    : `${names.slice(0, -1).join(', ')} and ${names.at(-1)}`
}

// Who in the window carries each change an allele is drawn as, counted live
// from the forms; the allele's own `inPanel` where the map draws none.
export function carriersHere(
  dataset: PangenomeDataset,
  allele: KnownAllele,
  panel: StructuralPanel | undefined,
  panelHaplotypes: string[],
) {
  const said = panel
    ? allele.drawn.flatMap(d =>
        carriersOf(dataset, panel, d.label, panelHaplotypes),
      )
    : []
  return said.length > 0
    ? `Here, ${said.join('; ')}.`
    : `In this panel: ${allele.inPanel}.`
}

function carriersOf(
  dataset: PangenomeDataset,
  panel: StructuralPanel,
  label: string,
  panelHaplotypes: string[],
) {
  const changes = panel.changes.filter(
    c => panel.alleleNames[changeKey(c.mark)] === label,
  )
  const first = changes[0]
  const members = new Set(changes.flatMap(c => c.members))
  const others = panelHaplotypes.filter(h => !members.has(h))
  const named = (haplotypes: string[]) =>
    nameList(haplotypes.map(h => haplotypeName(dataset, h)))
  const aligned = first ? alignedAt(panel, first.mark) : 0
  return first && members.size > 0
    ? [
        `${label}: ${
          panelHaplotypes.length > NAMED_PANEL_MAX
            ? `${members.size} of the ${aligned} haplotypes aligned (${percent(members.size, aligned)})`
            : others.length > 0 &&
                others.length <= 3 &&
                members.size > others.length
              ? `all but ${named(others)}`
              : named([...members])
        }`,
      ]
    : []
}

// What the live region reads out when an answer arrives. It sits outside the
// answer, which remounts per question, so a screen reader hears each one.
export function spoken(answer: RegionAnswer, referenceLabel: string) {
  const { reading } = answer
  const said = reading?.panel
    ? headline(reading.panel, referenceLabel)
    : reading
      ? readingSentence(reading, referenceLabel)
      : ''
  return `${answer.title ?? formatRegion(answer.region)}. ${said}`.trim()
}
