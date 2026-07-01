import { Suspense, lazy } from 'react'

// react-msaview pulls in @jbrowse/core + MUI + mobx and renders to canvas, so the
// model-building inner must run client-side only. React.lazy keeps it out of the
// SSR pass (the parent island server-renders the Suspense fallback).
const MsaPanelInner = lazy(() => import('./MsaPanelInner.tsx'))

export interface MsaPanelProps {
  msaUrl?: string
  gffUrl?: string
  height?: number
  // Row name to diff every other row against (matches render as "."), so the
  // divergence from a reference haplotype pops out of an otherwise-identical wall.
  relativeTo?: string
}

export default function MsaPanel(props: MsaPanelProps) {
  return (
    <Suspense fallback={<p className="pg-hint">Loading alignment viewer…</p>}>
      <MsaPanelInner {...props} />
    </Suspense>
  )
}
