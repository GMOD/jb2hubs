import useSWRImmutable from 'swr/immutable'

import { useUrlState } from '../hooks/useUrlState.ts'
import { LIVE_QUERY } from '../lib/swr.ts'
import { regionAnswer } from './pangenomeAnswer.ts'
import { MAX_DETAIL_WINDOW_BP } from './pangenomeLoci.ts'
import { formatRegion } from './pangenomeRegion.ts'

import type { Reading } from './pangenomeAnswer.ts'
import type { PangenomeDataset } from './pangenomeDataset.ts'
import type { PangenomeExample } from './pangenomeExamples.ts'

// mygene.info answers in well under a second and a sidecar read in a third of
// one; past this, the button would say "Reading…" for as long as either stalls.
const DEADLINE_MS = 20_000

function deadlineMessage(e: unknown) {
  return e instanceof DOMException &&
    (e.name === 'TimeoutError' || e.name === 'AbortError')
    ? `No answer in ${DEADLINE_MS / 1000} s; try again.`
    : e instanceof Error
      ? e.message
      : String(e)
}

const count = (n: number, noun: string) =>
  `${n.toLocaleString('en-US')} ${noun}${n === 1 ? '' : 's'}`

function readingSentence(reading: Reading, referenceLabel: string) {
  const { haplotypes, panel, sites } = reading
  const rare =
    reading.rareCarriers > 0
      ? ` ${count(reading.rareCarriers, 'haplotype')} also carry something rarer.`
      : ''
  if (panel) {
    const shown =
      panel.lanes.length < panel.forms
        ? `, the ${panel.lanes.length} commonest below`
        : ''
    const uncalled =
      panel.uncalled > 0
        ? ` ${count(panel.uncalled, 'haplotype')} without this chromosome have no lane.`
        : ''
    return `${count(sites, 'structural variant site')} sort the callset's ${haplotypes} haplotypes into ${count(panel.forms, 'form')} that 1% or more carry${shown}.${rare}${uncalled}`
  }
  const agree =
    reading.nonReferenceMajority > 0
      ? `The callset's ${haplotypes} haplotypes share one structure here, which differs from ${referenceLabel} at ${count(reading.nonReferenceMajority, 'site')}.`
      : `The callset's ${haplotypes} haplotypes share ${referenceLabel}'s structure here.`
  return `${agree}${rare}`
}

// The one control on a pangenome page: a gene or a region in, the ways to open
// it out. The question rides in the url as `?region=`, so an answer can be
// linked to and reloads as itself.
export default function PangenomeRegionBox({
  dataset,
  examples,
  examplesLabel,
}: {
  dataset: PangenomeDataset
  examples: PangenomeExample[]
  examplesLabel: string
}) {
  const [asked, setAsked] = useUrlState('region', '')
  const {
    data: answer,
    error,
    isLoading,
    mutate,
  } = useSWRImmutable(
    asked ? ['pangenome-region', dataset.id, asked] : null,
    ([, , text]) =>
      regionAnswer(
        dataset,
        examples,
        text,
        AbortSignal.timeout(DEADLINE_MS),
      ).catch((e: unknown) => {
        throw new Error(deadlineMessage(e))
      }),
    LIVE_QUERY,
  )
  const reading = answer?.reading
  const lanes = reading?.panel?.lanes ?? []

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
          Gene or region{' '}
          <input
            key={asked}
            name="region"
            defaultValue={asked}
            placeholder={examples[0]?.region}
            size={34}
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

      {examples.length > 0 && (
        <p>
          {examplesLabel}:
          {examples.map(e => (
            <span key={e.id}>
              {' '}
              <a
                href={`?region=${encodeURIComponent(e.region)}`}
                title={e.description}
                aria-current={e.region === asked ? 'true' : undefined}
                style={{ whiteSpace: 'nowrap' }}
                onClick={event => {
                  event.preventDefault()
                  setAsked(e.region)
                }}
              >
                {e.label}
              </a>
            </span>
          ))}
        </p>
      )}

      {error instanceof Error && <p role="alert">{error.message}</p>}

      {answer && (
        <section aria-live="polite">
          <h2>{answer.title ?? formatRegion(answer.region)}</h2>
          {answer.title && (
            <p>
              {answer.example?.description && `${answer.example.description}, `}
              <code>{formatRegion(answer.region)}</code>
            </p>
          )}
          <ul>
            {answer.launches.map(l => (
              <li key={l.kind}>
                <a
                  href={l.url}
                  target="_blank"
                  rel="noreferrer"
                >
                  {l.label}
                </a>
                : {l.about}
              </li>
            ))}
          </ul>
          {dataset.graphVcf &&
            answer.region.end - answer.region.start > MAX_DETAIL_WINDOW_BP && (
              <p>
                Only the graph draws a window over {MAX_DETAIL_WINDOW_BP / 1000}{' '}
                kb. Narrow it for variants and haplotypes.
              </p>
            )}
          {reading && (
            <p>{readingSentence(reading, dataset.reference.label)}</p>
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
        </section>
      )}
    </div>
  )
}
