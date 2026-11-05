import { geneWindow } from './geneSearch.ts'
import { panelTracks, syntenyViewUrl } from './jbrowseLinks.ts'
import { placePanels } from './panelPlacement.ts'

import type { NcbiGene } from './geneSearch.ts'
import type { AssemblyStore } from './orthologDb.ts'

export interface LaunchAssembly {
  id: string
  taxonId?: number
  geneTrack: string
}

export interface ResolvedGenePair {
  gene?: NcbiGene
  ortholog?: NcbiGene
  store: AssemblyStore
}

// The searched gene sits on the panel of its own taxon, which after a swap is
// the second. A panel with no locus is the whole genome, where a gene track
// only opens a "Requested too much data" banner, so it opens none. `sameScale`
// stays off: on `main` it zoomed both TP53 panels out to whole chromosomes
// (2026-10-08).
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
  const geneTaxon = resolved?.gene
    ? Number(resolved.gene.tax_id)
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
        symbol: i === searchedRow ? symbol : undefined,
        searched: symbol !== undefined && i === searchedRow,
      }
    }),
  )
  const views = plan.panels.map(({ loc, placement }, i) => {
    const assembly = assemblies[i]!
    return placement === 'none'
      ? { assembly: assembly.id }
      : {
          assembly: assembly.id,
          ...(loc ? { loc } : {}),
          ...panelTracks(assembly.geneTrack),
        }
  })
  const url = syntenyViewUrl(views, [trackId], {
    encoding: { color: { field: 'query' } },
    mark: { interpolate: 'bump' },
    ...(plan.followAnchor === undefined
      ? { autoDiagonalize: plan.panels.some(p => p.placement !== 'gene') }
      : {
          followSynteny: true,
          followAnchorIndex: plan.followAnchor,
          followMatchOrientation: true,
        }),
  })
  const alignedRow = plan.panels.findIndex(p => p.placement === 'alignment')
  return { url, alignedAssembly: assemblies[alignedRow]?.id }
}
