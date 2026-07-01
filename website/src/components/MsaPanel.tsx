import { Suspense, lazy } from 'react'

// react-msaview pulls in @jbrowse/core + MUI + mobx and renders to canvas, so the
// model-building inner must run client-side only. React.lazy keeps it out of the
// SSR pass (the parent island server-renders the Suspense fallback).
const MsaPanelInner = lazy(() => import('./MsaPanelInner.tsx'))

export interface MsaPanelProps {
  msaUrl?: string
  gffUrl?: string
  height?: number
  // Diff every row against the alignment's reference (matches render as "."), so
  // divergence pops out of an otherwise-identical wall. The reference is the first
  // row — the spine of a reference-projected MSA — so the panel needs no
  // organism-specific row name and works for any such alignment.
  diff?: boolean
}

export default function MsaPanel(props: MsaPanelProps) {
  return (
    <Suspense fallback={<p className="pg-hint">Loading alignment viewer…</p>}>
      <MsaPanelInner {...props} />
    </Suspense>
  )
}
