// What a protein launch opens, from the gene, the alignment and the focus.
// ProteinLaunchCard and scripts/checkProteinLaunches.ts both build sessions
// through it, so the check boots the session the page builds.

import { pickAlphaFoldModel } from 'p2s_mapper'

import { EDITS, editConsequence } from './editConsequence.ts'
import { privateResidues, toCanonical, toTranslation } from './focus.ts'
import { markFocus } from './proteinAlignments.ts'
import { focusRanges } from './proteinFeatures.ts'
import {
  buildSessionUrl,
  chooseStructure,
  colorsFor,
} from './proteinSession.ts'

import type { EditConsequence } from './editConsequence.ts'
import type { GeneStructure } from './geneStructure.ts'
import type { LoadedAlignment } from './proteinAlignments.ts'
import type { Focus } from './proteinFeatures.ts'
import type {
  ColorChoice,
  StructureSource,
  SuperposedIsoform,
} from './proteinSession.ts'

// What each edit at a focused residue does to the translation, with the
// residues it removes carried back onto the canonical the map counts on as
// `shown`.
export function residueConsequences(
  structure: GeneStructure,
  focus: Focus | undefined,
) {
  const translation = structure.proteinSequence
  const at =
    focus?.kind === 'residue'
      ? toTranslation(structure, focusRanges(focus))?.[0]?.start
      : undefined
  if (!translation || at === undefined) {
    return []
  }
  return EDITS.flatMap(edit => {
    const c = editConsequence(
      structure.transcript,
      translation.length,
      at,
      edit,
    )
    return c
      ? [
          {
            ...c,
            shown: toCanonical(structure, c.lost) ?? [],
          },
        ]
      : []
  })
}

function launchModel(structure: GeneStructure) {
  const translation = structure.proteinSequence
  return pickAlphaFoldModel(
    structure.alphafold,
    translation ? { translation: { seq: translation } } : undefined,
  )
}

// The entries a focused interface or ligand site was seen in
function complexIdsOf(focus: Focus | undefined) {
  return focus?.kind === 'region' &&
    (focus.region.kind === 'interface' || focus.region.kind === 'ligand')
    ? (focus.region.pdbIds ?? [])
    : []
}

// Which structure a launch opens before the experimental entries are read, and
// whether they have to be.
export function launchStructure({
  structure,
  focus,
  structureChoice,
  residueEntry,
}: Pick<
  LaunchInputs,
  'structure' | 'focus' | 'structureChoice' | 'residueEntry'
>) {
  const model = launchModel(structure)
  const complexIds = complexIdsOf(focus)
  const { needsList, chosen } = chooseStructure({
    pick: structureChoice,
    complexId: complexIds[0],
    residueEntry,
    hasModel: !!model,
  })
  return { model, complexIds, needsList, chosen }
}

// The accession that names a model to the plugin: the isoform's own
// (P26367-2) for an isoform model, since the entry's opens the canonical model.
function modelSource(
  uniprotId: string | undefined,
  model: ReturnType<typeof launchModel>,
): StructureSource | undefined {
  return uniprotId
    ? {
        uniprotId: model?.accession.startsWith(`${uniprotId}-`)
          ? model.accession
          : uniprotId,
      }
    : undefined
}

// The canonical's model beside the launched isoform's own, each on its own
// transcript, where AlphaFold folded both and a RefSeq isoform spells the
// canonical. With nothing focused each lights the residues it has to itself.
function superposedCanonical(
  structure: GeneStructure,
  model: ReturnType<typeof launchModel>,
  focus: Focus | undefined,
  consequence: EditConsequence | undefined,
): SuperposedIsoform | undefined {
  const { uniprotId, canonical, canonicalIsoform } = structure
  const canonicalModel = structure.alphafold.find(
    m => !m.accession.includes('-'),
  )
  return uniprotId &&
    canonical &&
    canonicalIsoform &&
    canonicalModel &&
    model &&
    model.accession !== canonicalModel.accession
    ? {
        source: { uniprotId },
        transcript: canonicalIsoform.transcript,
        proteinSequence: canonical,
        initialTranscriptResidues: consequence
          ? toCanonical(structure, consequence.lost)
          : focus
            ? focusRanges(focus)
            : privateResidues(structure)?.canonical,
      }
    : undefined
}

export interface LaunchInputs {
  structure: GeneStructure
  alignment: LoadedAlignment | undefined
  focus: Focus | undefined
  // `alphafold`, `none` or a PDB id, picked or named by a chip or link
  structureChoice?: string
  // the entry a focused residue is seen touching something in
  residueEntry?: string
  // launchStructure's answer, which the caller needs first to know whether to
  // list experimental entries
  choice: ReturnType<typeof launchStructure>
  // the best-covering experimental entry, needed only when `needsList`
  bestEntry?: string
  consequence?: EditConsequence
  colorChoice?: ColorChoice
}

export function launchPlan(inputs: LaunchInputs) {
  const { structure, alignment, focus, consequence, colorChoice } = inputs
  const { uniprotId, taxId } = structure
  const translation = structure.proteinSequence
  const { model, complexIds, needsList, chosen: decided } = inputs.choice
  const chosen = decided ?? inputs.bestEntry ?? 'none'
  const primary: StructureSource | undefined =
    chosen === 'none'
      ? undefined
      : chosen === 'alphafold'
        ? modelSource(uniprotId, model)
        : { pdbId: chosen }
  const predicted = chosen === 'alphafold'
  const superposed = predicted
    ? superposedCanonical(structure, model, focus, consequence)
    : undefined
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
    ? toTranslation(structure, focusRanges(focus))
    : undefined
  // an edit opens on the residues it removes, already on the translation
  const selection = consequence
    ? consequence.lost
    : (residueSelection ??
      (superposed ? privateResidues(structure)?.launched : undefined))
  const { url } = buildSessionUrl({
    structure,
    primary,
    initialTranscriptResidues: selection,
    superposed,
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
    superposed,
    predicted,
    identical,
    colors,
    color,
    residueSelection,
    selection,
    url,
  }
}
