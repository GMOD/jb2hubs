import useSWRImmutable from 'swr/immutable'

import { useUrlState } from '../hooks/useUrlState.ts'
import { LIVE_QUERY } from '../lib/swr.ts'
import {
  graphRegionUrl,
  haplotypeLanesForRegion,
  referenceRegionUrl,
} from './pangenomeLinks.ts'
import { structuralPanel } from './pangenomePanels.ts'
import { formatRegion, resolveRegion } from './pangenomeRegion.ts'
import { structuralForms } from './pangenomeSvStates.ts'

import type { PangenomeDataset } from './pangenomeDataset.ts'

// mygene.info answers in well under a second and a sidecar read in a third of
// one; past this, the button would say "Reading…" for as long as either stalls.
const DEADLINE_MS = 20_000

function deadlineMessage(e: unknown) {
  return e instanceof DOMException &&
    (e.name === 'TimeoutError' || e.name === 'AbortError')
    ? `No answer from mygene.info or the callset in ${DEADLINE_MS / 1000} s; try again.`
    : e instanceof Error
      ? e.message
      : String(e)
}

// The sidecar reader, and @gmod/tabix with it, loads on the first question
// rather than with the page, since most readers never ask one.
async function regionAnswer(dataset: PangenomeDataset, text: string) {
  try {
    const signal = AbortSignal.timeout(DEADLINE_MS)
    const asked = await resolveRegion(text, dataset.reference.taxonId, {
      signal,
    })
    if (!asked) {
      throw new Error(
        `"${text}" is neither a region like chr1:196,740,001-196,850,000 nor a gene placed on ${dataset.reference.label}`,
      )
    }
    const { openSvStates } = await import('./pangenomeSvStatesFile.ts')
    const { chrom, haplotypes, rows } = await openSvStates(
      dataset.svStatesUrl!,
    )(asked.chrom, asked.start, asked.end, signal)
    const forms = structuralForms(rows, haplotypes)
    return {
      region: { ...asked, chrom },
      haplotypes: haplotypes.length,
      panel: structuralPanel(forms, {
        withoutGenes: new Set(dataset.haplotypesWithoutGenes ?? []),
      }),
      sites: forms.sites,
      informative: forms.informative,
      rareCarriers: forms.rareCarriers.length,
      nonReferenceMajority: forms.nonReferenceMajority,
    }
  } catch (e) {
    throw new Error(deadlineMessage(e))
  }
}

// Any region of the graph, not only the twenty the table lists.
//
// The page is otherwise static; this is the one thing on it that cannot be, as
// the answer depends on what a reader asks for. It reads the structural-state
// sidecar for the window — a ranged read of a few KB, since the file is tabix
// indexed — groups the haplotypes into the forms they carry there, and opens
// the same launches the table's rows do. The rules are shared with
// `generatePangenomePanels.ts`, so a locus in the table and the same window
// typed here answer identically.
//
// The question rides in the url as `?region=`, so an answer can be linked to
// and reloads as itself.
export default function PangenomeRegionForms({
  dataset,
}: {
  dataset: PangenomeDataset
}) {
  const [asked, setAsked] = useUrlState('region', '')
  const {
    data: answer,
    error,
    isLoading,
    mutate,
  } = useSWRImmutable(
    asked ? ['pangenome-region', dataset.id, asked] : null,
    ([, , text]) => regionAnswer(dataset, text),
    LIVE_QUERY,
  )

  const lanes = answer?.panel?.lanes ?? []
  const region = answer?.region
  const graphRegion = region && { ...region, label: formatRegion(region) }

  return (
    <div>
      <form
        onSubmit={e => {
          e.preventDefault()
          const text = String(
            new FormData(e.currentTarget).get('region') ?? '',
          ).trim()
          if (text === asked) {
            void mutate()
          } else {
            setAsked(text)
          }
        }}
      >
        <label>
          Region or gene{' '}
          <input
            key={asked}
            name="region"
            defaultValue={asked}
            placeholder="chr1:196,740,001-196,850,000 or CFH"
            size={38}
            required
          />
        </label>{' '}
        <button
          type="submit"
          disabled={isLoading}
        >
          {isLoading ? 'Reading…' : 'Show'}
        </button>
      </form>

      {error instanceof Error && <p>{error.message}</p>}

      {answer && region && (
        <>
          <p>
            <code>{formatRegion(region)}</code>: {answer.sites} structural
            records, {answer.informative} of them telling the{' '}
            {answer.haplotypes} haplotypes apart
            {answer.panel
              ? `, in ${answer.panel.forms} form${answer.panel.forms === 1 ? '' : 's'} carried by 1% or more`
              : answer.nonReferenceMajority > 0
                ? `. The haplotypes agree here, and differ from ${dataset.reference.label} at ${answer.nonReferenceMajority} of the records`
                : `. The haplotypes agree here, and with ${dataset.reference.label}`}
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
