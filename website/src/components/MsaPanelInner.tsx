import { useEffect, useState } from 'react'

import { createJBrowseTheme } from '@jbrowse/core/ui/theme'
import useMeasure from '@jbrowse/core/util/useMeasure'
import { ThemeProvider } from '@mui/material/styles'
import { MSAModelF, MSAView } from 'react-msaview'

import type { MsaPanelProps } from './MsaPanel.tsx'

const theme = createJBrowseTheme()

const uriLoc = (uri: string) => ({ uri, locationType: 'UriLocation' as const })

// Label gutter width. The panel draws no phylogenetic tree (a guide tree over a
// reference-projected reconstruction is circular), so the gutter only holds the
// short "sample#hap" labels — 132px fits them instead of the default 400px the
// tree would otherwise reserve.
const LABEL_GUTTER = 132

export default function MsaPanelInner({
  msaUrl,
  gffUrl,
  height = 460,
  relativeTo,
}: MsaPanelProps) {
  // MST instance, built once from the initial props (a stable model, not a value
  // safe to recompute — so useState lazy init, not useMemo). Height is synced
  // below; the parent still remounts via `key` when the diff toggle flips, since
  // `relativeTo` is a construction-time model option.
  const [model] = useState(() =>
    MSAModelF().create({
      type: 'MsaView',
      ...(msaUrl ? { msaFilehandle: uriLoc(msaUrl) } : {}),
      ...(gffUrl ? { gffFilehandle: uriLoc(gffUrl) } : {}),
      colorSchemeName: 'clustalx_dna',
      drawTree: false,
      treeAreaWidth: LABEL_GUTTER,
      height,
      ...(relativeTo ? { relativeTo } : {}),
    }),
  )

  const [ref, { width }] = useMeasure()
  useEffect(() => {
    if (width) {
      model.setWidth(width)
    }
  }, [model, width])

  // Expand/collapse is a pure height change — set it on the model instead of
  // remounting (and re-fetching the alignment) the way a `key` change would.
  useEffect(() => {
    model.setHeight(height)
  }, [model, height])

  return (
    <ThemeProvider theme={theme}>
      <div ref={ref}>
        <MSAView model={model} />
      </div>
    </ThemeProvider>
  )
}
