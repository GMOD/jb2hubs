import { Suspense, lazy } from 'react'

// react-msaview pulls in @jbrowse/core + MUI + mobx and renders to canvas, so it
// must run client-side only. React.lazy keeps it out of the SSR pass (the parent
// island server-renders the Suspense fallback) without any useEffect plumbing.
const MSAViewer = lazy(() =>
  import('react-msaview').then(m => ({ default: m.MSAViewer })),
)

export interface MsaPanelProps {
  msaUrl?: string
  gffUrl?: string
  treeUrl?: string
  msa?: string
  gff?: string
  tree?: string
  height?: number
}

export default function MsaPanel({
  msaUrl,
  gffUrl,
  treeUrl,
  msa,
  gff,
  tree,
  height = 460,
}: MsaPanelProps) {
  return (
    <Suspense fallback={<p className="pg-hint">Loading alignment viewer…</p>}>
      <MSAViewer
        msa={msa}
        gff={gff}
        tree={tree}
        msaFilehandle={
          msaUrl ? { uri: msaUrl, locationType: 'UriLocation' } : undefined
        }
        gffFilehandle={
          gffUrl ? { uri: gffUrl, locationType: 'UriLocation' } : undefined
        }
        treeFilehandle={
          treeUrl ? { uri: treeUrl, locationType: 'UriLocation' } : undefined
        }
        height={height}
        colorScheme="clustalx_dna"
      />
    </Suspense>
  )
}
