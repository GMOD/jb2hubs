import { useState } from 'react'

import MsaPanel from './MsaPanel.tsx'

import type { PangenomeLocus } from './pangenomeLoci.ts'

const SHORT_HEIGHT = 420
const TALL_HEIGHT = 760

// The embedded react-msaview panel. Rows are shown reference-first (no guide tree);
// "diff vs <reference>" collapses matching columns to "." so divergence from the
// reference stands out (opt-in — first paint shows real bases). Both toggles are
// applied live on the model (height + drawRelativeTo), so the viewer only remounts
// when the locus changes, not on every toggle.
export default function PangenomeMsaSection({
  dataPrefix,
  referenceLabel,
  locus,
}: {
  dataPrefix: string
  referenceLabel: string
  locus: PangenomeLocus
}) {
  const [expanded, setExpanded] = useState(false)
  const [diff, setDiff] = useState(false)
  return (
    <div className="pg-msa">
      <div className="pg-msa-head">
        <h4 className="pg-chart-title">Multi-haplotype alignment</h4>
        <div className="pg-msa-controls">
          <button
            className={`pg-msa-toggle${diff ? ' pg-msa-toggle-on' : ''}`}
            onClick={() => {
              setDiff(d => !d)
            }}
          >
            {diff ? '✓ ' : ''}Diff vs {referenceLabel}
          </button>
          <button
            className="pg-msa-toggle"
            onClick={() => {
              setExpanded(e => !e)
            }}
          >
            {expanded ? 'Collapse' : 'Expand ⤢'}
          </button>
        </div>
      </div>
      <p className="pg-hint pg-pangene-caption">
        One ~800 bp window, haplotypes reconstructed from the VCF and projected
        onto {referenceLabel} (base-level SNVs/indels only — not structural
        variation, not gene structure).
      </p>
      <MsaPanel
        key={locus.id}
        msaUrl={`${dataPrefix}/msa/${locus.id}.fa`}
        gffUrl={`${dataPrefix}/msa/${locus.id}.exons.gff`}
        diff={diff}
        height={expanded ? TALL_HEIGHT : SHORT_HEIGHT}
      />
    </div>
  )
}
