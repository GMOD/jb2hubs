import { useState } from 'react'

import {
  externalGraphUrl,
  graphRegionUrl,
  launchRegion,
} from './pangenomeLinks.ts'
import { preferredLocus } from './pangenomeLoci.ts'
import { formatRegion, parseRegion } from './pangenomeRegion.ts'

import type { PangenomeDataset } from './pangenomeDataset.ts'
import type { PangenomeLocus } from './pangenomeLoci.ts'

// A locus's presets and the seeded box name the window its launch USES, not its
// display span. Those differ for exactly one locus and it is the headline one:
// the MHC's span is 4.97 Mb and its detail window is the 90 kb class II stretch
// the HPRC tutorial names, so seeding the span opened the form on a region the
// fine lanes cannot draw.
function regionText(locus: PangenomeLocus) {
  const r = launchRegion(locus)
  return formatRegion(r.chrom, r.start, r.end)
}

// Region form for drawing any window of the graph, with the catalog's loci and
// the graph's own chromosomes as presets. The JBrowse tutorials reach the same
// view from the track menu (Launch → Graph genome view (this region)); this is
// that launch with the region named up front.
//
// The chromosome row used to be a separate control calling a separate builder,
// because a chromosome needed the coarse tier and a locus did not. `lanes()`
// picks the tier by span now, so a chromosome is just the widest preset and
// both rows go through `graphRegionUrl`.
//
// Without a hosted `graphBrowser` (production, until core v5) the external
// browser is the launch rather than the alternative: the form submits to it and
// the in-browser button is not offered at all.
export default function GraphRegionLauncher({
  dataset,
}: {
  dataset: PangenomeDataset
}) {
  const loci = dataset.loci.filter(l => !l.graphCollapsed)
  const chromosomes = dataset.graphBrowser?.tierTrackId
    ? (dataset.graphBrowser.chromosomes ?? [])
    : []
  const landing = preferredLocus(loci) ?? loci[0]
  const [input, setInput] = useState(landing ? regionText(landing) : '')
  const parsed = parseRegion(input)
  const hosted = dataset.graphBrowser !== undefined
  const url = parsed.ok
    ? graphRegionUrl(dataset, {
        chrom: parsed.chrom,
        start: parsed.start,
        end: parsed.end,
      })
    : undefined
  const ext = dataset.externalGraphBrowser
  const externalUrl = parsed.ok ? externalGraphUrl(dataset, parsed) : undefined
  const submitUrl = hosted ? url : externalUrl
  const kb = parsed.ok ? Math.round((parsed.end - parsed.start) / 1000) : 0

  const note = parsed.ok
    ? hosted
      ? parsed.coarse && chromosomes.length > 0
        ? `Cuts the ${kb.toLocaleString()} kb window at bubble resolution — one node per top-level bubble, beside a curve of how many segments each holds.`
        : `Cuts the ${kb.toLocaleString()} kb subgraph at segment resolution and pairs it with a linear view of the same window.`
      : ext
        ? `Opens ${ext.name} on its ${ext.graphLabel} graph at this window.`
        : ''
    : parsed.error

  return (
    <div className="graph-launcher">
      <form
        className="graph-launcher-form"
        onSubmit={e => {
          e.preventDefault()
          if (submitUrl) {
            window.open(submitUrl, '_blank', 'noreferrer')
          }
        }}
      >
        <label htmlFor={`graph-region-${dataset.id}`}>
          {dataset.reference.label} region
        </label>
        <input
          id={`graph-region-${dataset.id}`}
          value={input}
          spellCheck={false}
          onChange={e => {
            setInput(e.target.value)
          }}
        />
        {hosted && (
          <button
            type="submit"
            className="portal-btn portal-btn-primary"
            disabled={!url}
          >
            Draw as a graph →
          </button>
        )}
        {externalUrl && ext && (
          <a
            className={
              hosted
                ? 'portal-btn portal-btn-ghost'
                : 'portal-btn portal-btn-primary'
            }
            href={externalUrl}
            target="_blank"
            rel="noreferrer"
            title={`${ext.name} draws the ${ext.graphLabel} graph at any scale, up to a whole chromosome`}
          >
            Open in {ext.name} ↗
          </a>
        )}
      </form>
      <p
        className="graph-launcher-note"
        aria-live="polite"
      >
        {note}
      </p>
      <div className="graph-launcher-presets">
        {loci.slice(0, 8).map(l => (
          <button
            key={l.id}
            type="button"
            className={
              regionText(l) === input
                ? 'pg-filter pg-filter-active'
                : 'pg-filter'
            }
            onClick={() => {
              setInput(regionText(l))
            }}
          >
            {l.gene}
          </button>
        ))}
        {chromosomes.map(c => (
          <button
            key={c.name}
            type="button"
            className={
              formatRegion(c.name, 0, c.length) === input
                ? 'pg-filter pg-filter-active'
                : 'pg-filter'
            }
            title={`${c.name} whole, at bubble resolution`}
            onClick={() => {
              setInput(formatRegion(c.name, 0, c.length))
            }}
          >
            {c.name}
          </button>
        ))}
      </div>
    </div>
  )
}
