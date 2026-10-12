// What a protein launch opens, from the gene, the alignment and the focus.
// ProteinLaunchCard and scripts/checkProteinLaunches.ts both build sessions
// through it, so the check boots the session the page builds.

import { pickAlphaFoldModel } from 'p2s_mapper'

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
import type { StructureSource } from './proteinSession.ts'

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
  // the best-covering experimental entry, needed only when `needsList`
  bestEntry?: string
  consequence?: EditConsequence
  colorChoice?: string
}

export function launchPlan({
  structure,
  launched,
  alignment,
  focus,
  structureChoice,
  residueEntry,
  bestEntry,
  consequence,
  colorChoice,
}: LaunchInputs) {
  const { uniprotId, taxId } = structure
  const canonical = canonicalSequence(structure)
  const translation = launched.proteinSequence
  const model = launchModel(structure, launched)
  const complexIds = complexIdsOf(focus)
  const { needsList, chosen } = chooseStructure({
    pick: structureChoice,
    complexId: complexIds[0],
    residueEntry,
    hasModel: !!model,
    bestEntry,
  })
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

  // A focus is numbered on the canonical; the plugin lights residues of the
  // launched translation. A pair too long to align (TTN) carries nothing:
  // canonical numbers sent as the translation's would land thousands of
  // residues off.
  const ranges = focus ? focusRanges(focus) : undefined
  const residueSelection =
    ranges && translation && canonical
      ? translationRanges(ranges, canonical, translation)
      : ranges
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
