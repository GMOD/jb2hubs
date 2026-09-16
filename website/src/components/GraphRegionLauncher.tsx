import { useState } from 'react'

import {
  externalGraphUrl,
  graphRegionUrl,
  launchRegion,
} from './pangenomeLinks.ts'
import { preferredLocus } from './pangenomeLoci.ts'
import { formatRegion, parseRegion } from './pangenomeRegion.ts'

import type { PangenomeDataset } from './pangenomeDataset.ts'

// A region box and one button. The box is seeded with the catalogue's landing
// locus's launch window, not its display span: the MHC's span is 4.97 Mb and
// its window is the 90 kb class II stretch the tutorial names.
//
// Without a hosted graph (production, until core v5) the button opens the
// external browser instead, where the dataset names one.
export default function GraphRegionLauncher({
  dataset,
}: {
  dataset: PangenomeDataset
}) {
  const landing = preferredLocus(dataset.loci.filter(l => !l.graphCollapsed))
  const [input, setInput] = useState(() => {
    if (!landing) {
      return ''
    }
    const r = launchRegion(landing)
    return formatRegion(r.chrom, r.start, r.end)
  })
  const parsed = parseRegion(input)
  const hosted = dataset.graphBrowser !== undefined
  const ext = dataset.externalGraphBrowser
  const url = parsed.ok
    ? hosted
      ? graphRegionUrl(dataset, parsed)
      : externalGraphUrl(dataset, parsed)
    : undefined

  return (
    <form
      onSubmit={e => {
        e.preventDefault()
        if (url) {
          window.open(url, '_blank', 'noreferrer')
        }
      }}
    >
      <label>
        {dataset.reference.label} region{' '}
        <input
          value={input}
          size={32}
          spellCheck={false}
          onChange={e => {
            setInput(e.target.value)
          }}
        />
      </label>{' '}
      <button
        type="submit"
        disabled={!url}
      >
        {hosted ? 'Draw graph' : `Open in ${ext?.name ?? 'graph browser'}`}
      </button>
      {!parsed.ok && input !== '' && <span> {parsed.error}</span>}
    </form>
  )
}
