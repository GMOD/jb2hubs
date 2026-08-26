import { useState } from 'react'

import {
  externalGraphUrl,
  graphChromosomeUrl,
  graphRegionUrl,
} from './pangenomeLinks.ts'
import { detailWindow } from './pangenomeLoci.ts'
import { formatRegion, parseRegion } from './pangenomeRegion.ts'

import type { PangenomeDataset } from './pangenomeDataset.ts'

// Region form for drawing any window of the graph, with the catalog's drawable
// loci as presets. The JBrowse tutorials reach the same view from the track
// menu (Launch → Graph genome view (this region)); this is that launch with the
// region named up front.
export default function GraphRegionLauncher({
  dataset,
}: {
  dataset: PangenomeDataset
}) {
  const presets = dataset.loci.flatMap(l => {
    const w = detailWindow(l)
    return w && !l.graphCollapsed
      ? [
          {
            id: l.id,
            gene: l.gene,
            region: formatRegion(l.chrom, w.start, w.end),
          },
        ]
      : []
  })
  const [input, setInput] = useState(presets[0]?.region ?? '')
  const parsed = parseRegion(input)
  const url = parsed.ok
    ? graphRegionUrl(dataset, {
        chrom: parsed.chrom,
        start: parsed.start,
        end: parsed.end,
        label: formatRegion(parsed.chrom, parsed.start, parsed.end),
      })
    : undefined
  const ext = dataset.externalGraphBrowser
  const externalUrl = parsed.ok ? externalGraphUrl(dataset, parsed) : undefined
  const chromosomes = dataset.graphBrowser?.tierTrackId
    ? (dataset.graphBrowser.chromosomes ?? [])
    : []

  return (
    <div className="graph-launcher">
      <form
        className="graph-launcher-form"
        onSubmit={e => {
          e.preventDefault()
          if (url) {
            window.open(url, '_blank', 'noreferrer')
          }
        }}
      >
        <label htmlFor="graph-region">{dataset.reference.label} region</label>
        <input
          id="graph-region"
          value={input}
          spellCheck={false}
          onChange={e => {
            setInput(e.target.value)
          }}
        />
        <button
          type="submit"
          className="portal-btn portal-btn-primary"
          disabled={!url}
        >
          Draw as a graph →
        </button>
        {externalUrl && ext && (
          <a
            className="portal-btn portal-btn-ghost"
            href={externalUrl}
            target="_blank"
            rel="noreferrer"
            title={`${ext.name} draws the ${ext.graphLabel} graph at any scale, up to a whole chromosome`}
          >
            Open in {ext.name} ↗
          </a>
        )}
      </form>
      <p className="graph-launcher-note">
        {parsed.ok
          ? parsed.wide
            ? 'Wider than 150 kb: the layout scales to fit, so nodes shrink to a thread. Zoom the linear panel and relaunch from its track menu for detail.'
            : `Cuts the ${Math.round((parsed.end - parsed.start) / 1000)} kb subgraph and pairs it with a linear view of the same window.`
          : parsed.error}
      </p>
      <div className="graph-launcher-presets">
        {presets.map(p => (
          <button
            key={p.id}
            type="button"
            className={
              p.region === input ? 'pg-filter pg-filter-active' : 'pg-filter'
            }
            onClick={() => {
              setInput(p.region)
            }}
          >
            {p.gene}
          </button>
        ))}
      </div>
      {chromosomes.length > 0 && (
        <>
          <p className="graph-launcher-note">
            Or a whole chromosome at bubble resolution — one node per top-level
            bubble, a few hundred nodes for the longest, beside a curve of how
            many segments each bubble holds:
          </p>
          <div className="graph-launcher-presets">
            {chromosomes.map(c => (
              <a
                key={c.name}
                className="pg-filter"
                href={graphChromosomeUrl(dataset, c.name)}
                target="_blank"
                rel="noreferrer"
              >
                {c.name.replace(/^chr/, '')}
              </a>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
