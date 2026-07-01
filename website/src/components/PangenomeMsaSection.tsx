import { useState } from 'react'

import MsaPanel from './MsaPanel.tsx'

import type { PangenomeLocus } from './pangenomeLoci.ts'

const SHORT_HEIGHT = 420
const TALL_HEIGHT = 760
// FASTA reference row to diff every other haplotype against.
const REFERENCE_ROW = 'GRCh38'

// The embedded react-msaview panel. Rows are shown reference-first (no guide tree);
// "diff vs GRCh38" collapses matching columns to "." so divergence from the
// reference stands out (opt-in — first paint shows real bases). Both toggles change
// the panel `key` to remount the viewer (re-reads the small alignment) rather than
// mutating its internal model.
export default function PangenomeMsaSection({
  locus,
}: {
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
            {diff ? '✓ ' : ''}Diff vs {REFERENCE_ROW}
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
        onto {REFERENCE_ROW} (base-level SNVs/indels only — not structural
        variation, not gene structure).
      </p>
      <MsaPanel
        key={`${locus.id}-${expanded ? 'tall' : 'short'}-${diff ? 'diff' : 'raw'}`}
        msaUrl={`/pangenome/msa/${locus.id}.fa`}
        gffUrl={`/pangenome/msa/${locus.id}.exons.gff`}
        relativeTo={diff ? REFERENCE_ROW : undefined}
        height={expanded ? TALL_HEIGHT : SHORT_HEIGHT}
      />
    </div>
  )
}
