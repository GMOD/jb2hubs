import { useEffect, useState } from 'react'

import { createJBrowseTheme } from '@jbrowse/core/ui/theme'
import useMeasure from '@jbrowse/core/util/useMeasure'
import { ThemeProvider } from '@mui/material/styles'
import { autorun } from 'mobx'
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
  diff,
}: MsaPanelProps) {
  // MST instance, built once (a stable model, not a value safe to recompute — so
  // useState lazy init, not useMemo). Height and diff are synced live below, so
  // the parent never has to remount the viewer to change either.
  const [model] = useState(() =>
    MSAModelF().create({
      type: 'MsaView',
      ...(msaUrl ? { msaFilehandle: uriLoc(msaUrl) } : {}),
      ...(gffUrl ? { gffFilehandle: uriLoc(gffUrl) } : {}),
      colorSchemeName: 'clustalx_dna',
      drawTree: false,
      treeAreaWidth: LABEL_GUTTER,
      height,
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

  // Diff against the alignment's reference — its first row, by the
  // reference-projected convention — so no organism-specific name is baked in.
  // The autorun re-fires once the MSA finishes loading and rowNames populates.
  useEffect(
    () =>
      autorun(() => {
        const reference = model.MSA ? model.rowNames[0] : undefined
        model.drawRelativeTo(diff && reference ? reference : undefined)
      }),
    [model, diff],
  )

  return (
    <ThemeProvider theme={theme}>
      <div ref={ref}>
        <MSAView model={model} />
      </div>
    </ThemeProvider>
  )
}
