// What a protein launch opens, from the gene, the alignment and the focus.
// ProteinLaunchCard and scripts/checkProteinLaunches.ts both build sessions
// through it, so the check boots the session the page builds.

import { pickAlphaFoldModel } from 'p2s_mapper'

import { EDITS, editConsequence } from './editConsequence.ts'
import { canonicalSequence } from './geneStructure.ts'
import { markFocus } from './proteinAlignments.ts'
import { focusRanges, translationRanges } from './proteinFeatures.ts'
import {
  buildSessionUrl,
  chooseStructure,
  colorsFor,
} from './proteinSession.ts'

import type { EditConsequence } from './editConsequence.ts'
import type { GeneStructure } from './geneStructure.ts'
import type { LoadedAlignment } from './proteinAlignments.ts'
import type { Focus } from './proteinFeatures.ts'
import type { ResidueRange, StructureSource } from './proteinSession.ts'

// A focus is numbered on the canonical; the plugin lights residues of the
// launched translation. A pair too long to align (TTN) carries nothing:
// canonical numbers sent as the translation's would land thousands of
// residues off.
function onTranslation(
  structure: GeneStructure,
  launched: GeneStructure,
  ranges: readonly ResidueRange[],
) {
  const canonical = canonicalSequence(structure)
  const translation = launched.proteinSequence
  return translation && canonical
    ? translationRanges(ranges, canonical, translation)
    : ranges
}

// What each edit at a focused residue does to the launched translation, with
// the residues it removes carried back onto the canonical the map counts on as
// `shown`.
export function residueConsequences(
  structure: GeneStructure,
  launched: GeneStructure,
  focus: Focus | undefined,
) {
  const translation = launched.proteinSequence
  const at =
    focus?.kind === 'residue'
      ? onTranslation(structure, launched, focusRanges(focus))?.[0]?.start
      : undefined
  if (!translation || at === undefined) {
    return []
  }
  const canonical = canonicalSequence(structure)
  return EDITS.flatMap(edit => {
    const c = editConsequence(launched.transcript, translation.length, at, edit)
    return c
      ? [
          {
            ...c,
            shown: canonical
              ? (translationRanges(c.lost, translation, canonical) ?? [])
              : c.lost,
          },
        ]
      : []
  })
}

export function launchModel(structure: GeneStructure, launched: GeneStructure) {
  const translation = launched.proteinSequence
  return pickAlphaFoldModel(
    structure.alphafold,
    translation ? { translation: { seq: translation } } : undefined,
  )
}

// The entries a focused interface or ligand site was seen in
export function complexIdsOf(focus: Focus | undefined) {
  return focus?.kind === 'region' &&
    (focus.region.kind === 'interface' || focus.region.kind === 'ligand')
    ? (focus.region.pdbIds ?? [])
    : []
}

// Which structure a launch opens before the experimental entries are read, and
// whether they have to be.
export function launchStructure({
  structure,
  launched,
  focus,
  structureChoice,
  residueEntry,
}: Pick<
  LaunchInputs,
  'structure' | 'launched' | 'focus' | 'structureChoice' | 'residueEntry'
>) {
  const model = launchModel(structure, launched)
  const complexIds = complexIdsOf(focus)
  const { needsList, chosen } = chooseStructure({
    pick: structureChoice,
    complexId: complexIds[0],
    residueEntry,
    hasModel: !!model,
  })
  return { model, complexIds, needsList, chosen }
}

export interface LaunchInputs {
  structure: GeneStructure
  // the structure with the alignment's transcript and translation swapped in
  launched: GeneStructure
  alignment: LoadedAlignment | undefined
  focus: Focus | undefined
  // `alphafold`, `none` or a PDB id, picked or named by a chip or link
  structureChoice?: string
  // the entry a focused residue is seen touching something in
  residueEntry?: string
  // launchStructure's answer, when the caller already has it
  choice?: ReturnType<typeof launchStructure>
  // the best-covering experimental entry, needed only when `needsList`
  bestEntry?: string
  consequence?: EditConsequence
  colorChoice?: string
}

export function launchPlan(inputs: LaunchInputs) {
  const { structure, launched, alignment, focus, consequence, colorChoice } =
    inputs
  const { uniprotId, taxId } = structure
  const translation = launched.proteinSequence
  const {
    model,
    complexIds,
    needsList,
    chosen: decided,
  } = inputs.choice ?? launchStructure(inputs)
  const chosen = decided ?? inputs.bestEntry ?? 'none'
  const primary: StructureSource | undefined =
    chosen === 'none'
      ? undefined
      : chosen === 'alphafold'
        ? uniprotId
          ? { uniprotId }
          : undefined
        : { pdbId: chosen }
  const predicted = chosen === 'alphafold'
  // the plugin's pairwise alignment is then an identity
  const identical = predicted && model?.sequence === translation
  const colors = colorsFor({
    predicted,
    isoformModel: !!model?.accession.includes('-'),
    taxId,
  })
  const color =
    colors.find(c => c === colorChoice) ??
    (predicted ? 'plddt-confidence' : 'default')

  const residueSelection = focus
    ? onTranslation(structure, launched, focusRanges(focus))
    : undefined
  // an edit opens on the residues it removes, already on the translation
  const selection = consequence ? consequence.lost : residueSelection
  const { url } = buildSessionUrl({
    structure: launched,
    primary,
    initialTranscriptResidues: selection,
    msa: markFocus(alignment?.source, focus, residueSelection),
    showAlignment: !identical,
    colorScheme: color === 'default' ? undefined : color,
  })
  return {
    model,
    complexIds,
    needsList,
    chosen,
    primary,
    predicted,
    identical,
    colors,
    color,
    residueSelection,
    selection,
    url,
  }
}
