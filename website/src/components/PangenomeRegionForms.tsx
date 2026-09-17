import { useState } from 'react'

import {
  graphRegionUrl,
  haplotypeLanesForRegion,
  referenceRegionUrl,
} from './pangenomeLinks.ts'
import { structuralPanel } from './pangenomePanels.ts'
import { formatRegion, resolveRegion } from './pangenomeRegion.ts'
import { structuralForms } from './pangenomeSvStates.ts'
import { openSvStates } from './pangenomeSvStatesFile.ts'

import type { PangenomeDataset } from './pangenomeDataset.ts'
import type { ParsedRegion } from './pangenomeRegion.ts'

// Any region of the graph, not only the twenty the table lists.
//
// The page is otherwise static; this is the one thing on it that cannot be, as
// the answer depends on what a reader asks for. It reads the structural-state
// sidecar for the window — a ranged read of a few KB, since the file is tabix
// indexed — groups the haplotypes into the forms they carry there, and opens
// the same launches the table's rows do. The rules are shared with
// `generatePangenomePanels.ts`, so a locus in the table and the same window
// typed here answer identically.
export default function PangenomeRegionForms({
  dataset,
  initialQuery = '',
}: {
  dataset: PangenomeDataset
  initialQuery?: string
}) {
  const [query, setQuery] = useState(initialQuery)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string>()
  const [answer, setAnswer] = useState<{
    region: ParsedRegion
    haplotypes: number
    panel: ReturnType<typeof structuralPanel>
    sites: number
    informative: number
    rareCarriers: number
  }>()

  async function show(text: string) {
    setBusy(true)
    setError(undefined)
    try {
      const region = await resolveRegion(text, dataset.reference.taxonId)
      if (!region) {
        throw new Error(
          `"${text}" is neither a region like chr1:196,740,001-196,850,000 nor a gene placed on ${dataset.reference.label}`,
        )
      }
      const { haplotypes, rows } = await openSvStates(dataset.svStatesUrl!)(
        region.chrom,
        region.start,
        region.end,
      )
      const forms = structuralForms(rows, haplotypes)
      setAnswer({
        region,
        haplotypes: haplotypes.length,
        panel: structuralPanel(forms, {
          withoutGenes: new Set(dataset.haplotypesWithoutGenes ?? []),
        }),
        sites: forms.sites,
        informative: forms.informative,
        rareCarriers: forms.rareCarriers.length,
      })
    } catch (e) {
      setAnswer(undefined)
      setError(`${e}`)
    } finally {
      setBusy(false)
    }
  }

  const lanes = answer?.panel?.lanes ?? []
  const region = answer?.region
  const graphRegion = region && { ...region, label: formatRegion(region) }

  return (
    <div>
      <form
        onSubmit={e => {
          e.preventDefault()
          void show(query)
        }}
      >
        <label>
          Region or gene{' '}
          <input
            value={query}
            onChange={e => {
              setQuery(e.target.value)
            }}
            placeholder="chr1:196,740,001-196,850,000 or CFH"
            size={38}
          />
        </label>{' '}
        <button
          type="submit"
          disabled={busy || query.trim() === ''}
        >
          {busy ? 'Reading…' : 'Show'}
        </button>
      </form>

      {error && <p>{error}</p>}

      {answer && region && (
        <>
          <p>
            <code>{formatRegion(region)}</code>: {answer.sites} structural
            records, {answer.informative} of them telling the{' '}
            {answer.haplotypes} haplotypes apart
            {answer.panel
              ? `, in ${answer.panel.forms} form${answer.panel.forms === 1 ? '' : 's'} carried by 1% or more`
              : '. Every haplotype here carries what the reference does'}
            {answer.rareCarriers > 0 &&
              `; ${answer.rareCarriers} carry something rarer`}
            .
          </p>
          <p>
            {lanes.length > 0 && (
              <>
                <a
                  href={haplotypeLanesForRegion(
                    dataset,
                    graphRegion!,
                    lanes.map(l => l.haplotype),
                  )}
                  target="_blank"
                  rel="noreferrer"
                >
                  haplotypes
                </a>
                {' · '}
              </>
            )}
            {graphRegionUrl(dataset, graphRegion!) && (
              <a
                href={graphRegionUrl(dataset, graphRegion!)}
                target="_blank"
                rel="noreferrer"
              >
                graph
              </a>
            )}
            {dataset.graphVcf && (
              <>
                {graphRegionUrl(dataset, graphRegion!) ? ' · ' : ''}
                <a
                  href={referenceRegionUrl(dataset, graphRegion!)}
                  target="_blank"
                  rel="noreferrer"
                >
                  variants
                </a>
              </>
            )}
          </p>
          {lanes.length > 0 && (
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>Lane</th>
                    <th>Haplotypes</th>
                    <th>Share</th>
                  </tr>
                </thead>
                <tbody>
                  {lanes.map(lane => (
                    <tr key={lane.haplotype}>
                      <td>
                        <code>{lane.haplotype}</code>
                      </td>
                      <td>{lane.shares}</td>
                      <td>
                        {((100 * lane.shares) / answer.haplotypes).toFixed(1)}%
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  )
}
