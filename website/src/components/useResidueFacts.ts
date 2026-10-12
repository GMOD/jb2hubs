import useSWRImmutable from 'swr/immutable'

import { LIVE_QUERY } from '../lib/swr.ts'
import {
  type Focus,
  type ProteinRegion,
  conservationText,
  fetchConservation,
  fetchCuratedSpans,
  fetchLigandSynonyms,
  fetchOrigins,
  fetchResidueVariants,
  partnerAccessions,
  residueContextClauses,
  residueHeadline,
  residueVariantLines,
  unnamedLigands,
} from './proteinFeatures.ts'

// What the page says about a focused residue: the headline, the clauses in the
// fold, its conservation and UniProt's variants, read from four services once a
// residue is focused and from the partner and ligand lists as they arrive. The
// headline waits for everything that could change it, so neither a note nor
// "contacts DNA" replaces "lies in domain X" a second after the page draws.
export function useResidueFacts({
  uniprotId,
  canonical,
  regions,
  focus,
  partners,
  ligands,
  contactsPending,
}: {
  uniprotId: string | undefined
  canonical: string | undefined
  regions: ProteinRegion[] | undefined
  focus: Focus | undefined
  // PDBe's lists, once read
  partners: ProteinRegion[] | undefined
  ligands: ProteinRegion[] | undefined
  // whether a list the headline waits on is still being read
  contactsPending: boolean
}) {
  const residue = focus?.kind === 'residue' ? focus.position : undefined
  const label = focus?.kind === 'residue' ? focus.label : undefined
  const speciesOf =
    residue !== undefined && uniprotId && partners
      ? partnerAccessions(uniprotId, partners)
      : []
  const { data: origins, error: originsError } = useSWRImmutable(
    speciesOf.length
      ? (['uniprot-origins', speciesOf.join(',')] as const)
      : null,
    ([, ids]) => fetchOrigins(ids.split(',')),
    LIVE_QUERY,
  )
  // a partner list read before its species would name S. aureus as HBB's own
  const contactsReady = !speciesOf.length || !!origins || !!originsError
  const unnamed =
    residue !== undefined && ligands ? unnamedLigands(residue, ligands) : []
  const { data: ligandSynonyms, error: synonymsError } = useSWRImmutable(
    unnamed.length ? (['ligand-synonyms', unnamed.join(',')] as const) : null,
    ([, ids]) => fetchLigandSynonyms(ids.split(',')),
    LIVE_QUERY,
  )
  const ligandsReady = !unnamed.length || !!ligandSynonyms || !!synonymsError
  const { data: curated } = useSWRImmutable(
    uniprotId && residue !== undefined
      ? (['uniprot-curated', uniprotId] as const)
      : null,
    ([, id]) => fetchCuratedSpans(id),
    LIVE_QUERY,
  )
  const { data: conservation } = useSWRImmutable(
    uniprotId && residue !== undefined
      ? (['pdbe-conservation', uniprotId, residue] as const)
      : null,
    ([, id, position]) => fetchConservation(id, position),
    LIVE_QUERY,
  )
  const conserved =
    conservation && residue !== undefined
      ? conservationText(canonical?.[residue - 1], conservation)
      : ''
  const clauses =
    residue !== undefined && regions && uniprotId
      ? residueContextClauses(residue, uniprotId, regions, {
          partners: contactsReady ? partners : undefined,
          ligands: ligandsReady ? ligands : undefined,
          origins,
          ligandSynonyms,
          sequence: canonical,
          curated,
        })
      : []
  const { data: variants, isLoading: variantsLoading } = useSWRImmutable(
    uniprotId && residue !== undefined
      ? (['residue-variants', uniprotId, residue] as const)
      : null,
    ([, id, position]) => fetchResidueVariants(id, position),
    LIVE_QUERY,
  )
  const ready =
    !variantsLoading && !contactsPending && contactsReady && ligandsReady
  return {
    headline:
      residue !== undefined && ready
        ? residueHeadline(variants, clauses, label)
        : undefined,
    clauses,
    conserved,
    variantLines: variants && residueVariantLines(variants),
  }
}
