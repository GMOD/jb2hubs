import useSWRImmutable from 'swr/immutable'

import { useUrlState } from '../hooks/useUrlState.ts'
import { LIVE_QUERY } from '../lib/swr.ts'
import { regionLaunches } from './pangenomeLinks.ts'
import { MAX_DETAIL_WINDOW_BP } from './pangenomeLoci.ts'
import { structuralPanel } from './pangenomePanels.ts'
import {
  formatRegion,
  matchRefName,
  parseRegion,
  resolveRegion,
} from './pangenomeRegion.ts'
import { structuralForms } from './pangenomeSvStates.ts'

import type { PangenomeDataset } from './pangenomeDataset.ts'
import type { PangenomeExample } from './pangenomeExamples.ts'
import type { StructuralPanel } from './pangenomePanels.ts'

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

interface Reading {
  haplotypes: number
  panel?: StructuralPanel
  sites: number
  rareCarriers: number
  nonReferenceMajority: number
}

// A dataset with a structural-state sidecar also says which forms the
// haplotypes carry in the window. The sidecar reader, and @gmod/tabix with it,
// loads on the first question, since most readers never ask one.
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
        `"${text}" is neither a region nor a gene placed on ${dataset.reference.label}`,
      )
    }
    if (!dataset.svStatesUrl) {
      const chrom = matchRefName(
        asked.chrom,
        (dataset.graphBrowser?.chromosomes ?? []).map(c => c.name),
      )
      if (chrom === undefined) {
        throw new Error(`${asked.chrom} is not a sequence in the graph`)
      }
      return { region: { ...asked, chrom } }
    }
    const { openSvStates } = await import('./pangenomeSvStatesFile.ts')
    const svStates = openSvStates(dataset.svStatesUrl)
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
    const reading: Reading = {
      haplotypes: haplotypes.length,
      panel: structuralPanel(forms, {
        withoutGenes: new Set(dataset.haplotypesWithoutGenes ?? []),
      }),
      sites: forms.sites,
      rareCarriers: forms.rareCarriers.length,
      nonReferenceMajority: forms.nonReferenceMajority,
    }
    return { region: { ...asked, chrom }, reading }
  } catch (e) {
    throw new Error(deadlineMessage(e))
  }
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
    return `${count(sites, 'structural variant site')} sort the ${haplotypes} haplotypes into ${count(panel.forms, 'form')} that 1% or more carry${shown}.${rare}`
  }
  const agree =
    reading.nonReferenceMajority > 0
      ? `The ${haplotypes} haplotypes share one structure here, which differs from ${referenceLabel} at ${count(reading.nonReferenceMajority, 'site')}.`
      : `The ${haplotypes} haplotypes share ${referenceLabel}'s structure here.`
  return `${agree}${rare}`
}

// The one control on a pangenome page: a gene or a region in, the ways to open
// it out. The examples are the dataset's loci, and each asks the same question
// a reader would type.
//
// The question rides in the url as `?region=`, so an answer can be linked to
// and reloads as itself.
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
    ([, , text]) => regionAnswer(dataset, text),
    LIVE_QUERY,
  )

  const example = examples.find(e => e.region === asked)
  const title = example?.label ?? (parseRegion(asked) ? undefined : asked)
  const region = answer?.region
  const reading = answer?.reading
  const lanes = reading?.panel?.lanes ?? []
  const launches = region
    ? regionLaunches(
        dataset,
        { ...region, label: title ?? formatRegion(region) },
        lanes.map(l => l.haplotype),
        { graphCollapsed: example?.graphCollapsed },
      )
    : []
  const tooWideForCallset =
    region &&
    dataset.graphVcf &&
    region.end - region.start > MAX_DETAIL_WINDOW_BP

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
            <span key={e.region}>
              {' '}
              <a
                href={`?region=${encodeURIComponent(e.region)}`}
                title={e.description}
                aria-current={e === example ? 'true' : undefined}
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

      {region && (
        <section aria-live="polite">
          <h2>{title ?? formatRegion(region)}</h2>
          {title && (
            <p>
              {example?.description && `${example.description}, `}
              <code>{formatRegion(region)}</code>
            </p>
          )}
          <ul>
            {launches.map(l => (
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
          {tooWideForCallset && (
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
