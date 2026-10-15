import { flipLoc } from './jbrowseLinks.ts'

import type { GeneWindow } from './geneSearch.ts'

export interface PanelGene {
  // The gene's neighborhood where NCBI placed it on this panel's own assembly.
  window?: GeneWindow
  symbol?: string
  searched?: boolean
}

export type Placement = 'gene' | 'symbol' | 'alignment' | 'none'

export interface PlacedPanel {
  loc?: string
  placement: Placement
}

export interface PanelPlan {
  panels: PlacedPanel[]
  // Set when some panel is placed by the alignment: JBrowse's followSynteny
  // positions every other row from this one.
  followAnchor?: number
}

// The anchor is the searched gene's panel, on its NCBI window or else its bare
// symbol (an old UCSC build's text index), or failing both the first panel NCBI
// placed. Any other panel without a window is left to followSynteny, which
// places it through the alignment at the anchor's scale. Nothing follows an
// anchor showing the whole genome: on `main` that spread the mouse row over a
// dozen chromosomes (2026-10-15).
export function placePanels(genes: PanelGene[]): PanelPlan {
  const searched = genes.findIndex(g => g.searched)
  const anchor =
    searched >= 0 && (genes[searched]?.window ?? genes[searched]?.symbol)
      ? searched
      : genes.findIndex(g => g.window)
  const anchorStrand = anchor >= 0 ? genes[anchor]?.window?.strand : undefined
  const panels = genes.map((g, i): PlacedPanel => {
    if (g.window) {
      const flipped =
        anchorStrand !== undefined && g.window.strand !== anchorStrand
      return { loc: flipLoc(g.window.loc, flipped), placement: 'gene' }
    }
    if (i === anchor && g.symbol) {
      return { loc: g.symbol, placement: 'symbol' }
    }
    return { placement: anchor >= 0 ? 'alignment' : 'none' }
  })
  return panels.some(p => p.placement === 'alignment')
    ? { panels, followAnchor: anchor }
    : { panels }
}
