import { taxonIdOf } from './genePlacements.ts'
import { geneWindow } from './geneSearch.ts'
import { panelTracks, syntenyViewUrl } from './jbrowseLinks.ts'
import { placePanels } from './panelPlacement.ts'

import type { NcbiGene } from './geneSearch.ts'
import type { AssemblyStore } from './orthologDb.ts'

interface LaunchAssembly {
  id: string
  taxonId?: number
  geneTrack: string
}

interface ResolvedGenePair {
  gene?: NcbiGene
  ortholog?: NcbiGene
  store: AssemblyStore
}

export function isForeignGene(resolved: ResolvedGenePair | undefined) {
  return resolved !== undefined && resolved.gene === undefined
}

// A whole-genome panel opens no gene track, which would only show "Requested
// too much data". A lookup that answered without the gene found it in neither
// taxon, so its symbol anchors no panel.
export function planSyntenyLaunch({
  assemblies,
  trackId,
  symbol,
  resolved,
}: {
  assemblies: LaunchAssembly[]
  trackId: string
  symbol?: string
  resolved?: ResolvedGenePair
}) {
  const searched = isForeignGene(resolved) ? undefined : symbol
  const geneTaxon = resolved?.gene
    ? taxonIdOf(resolved.gene)
    : assemblies[0]?.taxonId
  const searchedRow = Math.max(
    0,
    assemblies.findIndex(a => a.taxonId === geneTaxon),
  )
  const plan = placePanels(
    assemblies.map((assembly, i) => {
      const ncbi =
        assembly.taxonId === geneTaxon ? resolved?.gene : resolved?.ortholog
      return {
        window:
          resolved && ncbi
            ? geneWindow(ncbi, assembly.id, resolved.store)
            : undefined,
        symbol: i === searchedRow ? searched : undefined,
        searched: searched !== undefined && i === searchedRow,
      }
    }),
  )
  const views = assemblies.map((assembly, i) => {
    const panel = plan.panels[i]
    return panel && panel.placement !== 'none'
      ? {
          assembly: assembly.id,
          ...(panel.loc ? { loc: panel.loc } : {}),
          ...panelTracks(assembly.geneTrack),
        }
      : { assembly: assembly.id }
  })
  const url = syntenyViewUrl(views, [trackId], {
    encoding: { color: { field: 'query' } },
    mark: { interpolate: 'bump' },
    ...(plan.followAnchor === undefined
      ? { autoDiagonalize: plan.panels.some(p => p.placement !== 'gene') }
      : { navigation: { follow: true, anchor: plan.followAnchor } }),
  })
  const alignedRow = plan.panels.findIndex(p => p.placement === 'alignment')
  return { url, alignedAssembly: assemblies[alignedRow]?.id }
}

// What the gene box says of a panel the alignment places. NCBI annotates some
// genes only on a newer build of the species than the one paired: zebrafish's
// annotation is on GRCz12tu and GRCz13ab, not danRer11, where the alignment
// still finds pax6a beside PAX6 (2026-11-12). "pax6a not on danRer11" read as
// the gene missing from the genome.
export function alignmentNote({
  symbol,
  ortholog,
  alignedName,
  alignedId,
}: {
  symbol: string
  ortholog?: string | null
  alignedName: string
  alignedId: string
}) {
  return ortholog
    ? `${symbol} → ${ortholog} · NCBI gives ${ortholog} no position on ${alignedId}, so ${alignedName} follows the alignment`
    : `NCBI lists no ${alignedName} ortholog of ${symbol}, so ${alignedName} follows the alignment`
}
