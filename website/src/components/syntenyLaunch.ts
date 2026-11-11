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

// A whole-genome panel opens no gene track, which would only show "Requested
// too much data".
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
