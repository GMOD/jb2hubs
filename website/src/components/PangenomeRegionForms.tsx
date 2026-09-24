import useSWRImmutable from 'swr/immutable'

import { useUrlState } from '../hooks/useUrlState.ts'
import { LIVE_QUERY } from '../lib/swr.ts'
import PangenomeLaunchLinks from './PangenomeLaunchLinks.tsx'
import {
  graphRegionUrl,
  haplotypeLanesForRegion,
  launchLinks,
  regionLaunchUrl,
} from './pangenomeLinks.ts'
import { MAX_DETAIL_WINDOW_BP } from './pangenomeLoci.ts'
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
//
// A window past MAX_DETAIL_WINDOW_BP gets no reading. Its forms would be
// hundreds of singletons, the callset opens behind "too much data", and the
// lanes pass the GBZ reader's node limit, so all it is offered is the graph,
// which draws a window that wide from its coarse tier.
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
    const svStates = openSvStates(dataset.svStatesUrl!)
    if (asked.end - asked.start > MAX_DETAIL_WINDOW_BP) {
      return {
        region: {
          ...asked,
          chrom: await svStates.chromOf(asked.chrom, signal),
        },
      }
    }
    const { chrom, haplotypes, rows } = await svStates.query(
      asked.chrom,
      asked.start,
      asked.end,
      signal,
    )
    const forms = structuralForms(rows, haplotypes)
    return {
      region: { ...asked, chrom },
      reading: {
        haplotypes: haplotypes.length,
        panel: structuralPanel(forms, {
          withoutGenes: new Set(dataset.haplotypesWithoutGenes ?? []),
        }),
        sites: forms.sites,
        informative: forms.informative,
        rareCarriers: forms.rareCarriers.length,
        nonReferenceMajority: forms.nonReferenceMajority,
      },
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

  const reading = answer?.reading
  const lanes = reading?.panel?.lanes ?? []
  const region = answer?.region
  const graphRegion = region && { ...region, label: formatRegion(region) }
  const launches = graphRegion
    ? launchLinks(dataset, {
        graph: graphRegionUrl(dataset, graphRegion),
        linear: reading && regionLaunchUrl(dataset, graphRegion),
        haplotypes: haplotypeLanesForRegion(
          dataset,
          graphRegion,
          lanes.map(l => l.haplotype),
        ),
      })
    : []

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

      {region && (
        <>
          {reading ? (
            <p>
              <code>{formatRegion(region)}</code>: {reading.sites} structural
              records, {reading.informative} of them telling the{' '}
              {reading.haplotypes} haplotypes apart
              {reading.panel
                ? reading.panel.forms > 0
                  ? `, in ${reading.panel.forms} form${reading.panel.forms === 1 ? '' : 's'} carried by 1% or more`
                  : ', in no form carried by 1% or more'
                : reading.nonReferenceMajority > 0
                  ? `. The haplotypes agree here, and differ from ${dataset.reference.label} at ${reading.nonReferenceMajority} of the records`
                  : `. The haplotypes agree here, and with ${dataset.reference.label}`}
              {reading.rareCarriers > 0 &&
                `; ${reading.rareCarriers} carry something rarer`}
              .
            </p>
          ) : (
            <p>
              <code>{formatRegion(region)}</code> spans{' '}
              {(region.end - region.start).toLocaleString('en-US')} bp. Forms,
              variants and haplotype lanes are read over{' '}
              {MAX_DETAIL_WINDOW_BP / 1000} kb or less,{' '}
              {launches.length > 0
                ? "so a window this wide opens as the graph's bubble tier alone."
                : 'so narrow it to see them.'}
            </p>
          )}
          {launches.length > 0 && (
            <p>
              <PangenomeLaunchLinks links={launches} />
            </p>
          )}
          {reading && lanes.length > 0 && (
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
                        {((100 * lane.shares) / reading.haplotypes).toFixed(1)}%
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
