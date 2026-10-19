import { useState } from 'react'

import useSWRImmutable from 'swr/immutable'

import { useUrlState } from '../hooks/useUrlState.ts'
import { LIVE_QUERY } from '../lib/swr.ts'
import GeneCombobox from './GeneCombobox.tsx'
import PangenomeGraph from './PangenomeGraph.tsx'
import PangenomeMap from './PangenomeMap.tsx'
import { regionAnswer } from './pangenomeAnswer.ts'
import { haplotypeLanesForRegion } from './pangenomeLinks.ts'
import { MAX_DETAIL_WINDOW_BP, isWide } from './pangenomeLoci.ts'
import {
  alignedAt,
  changeKey,
  changeName,
  changeWindow,
  headline,
} from './pangenomePanels.ts'
import { formatRegion } from './pangenomeRegion.ts'

import type { Reading, RegionAnswer } from './pangenomeAnswer.ts'
import type { PangenomeDataset } from './pangenomeDataset.ts'
import type { PangenomeExample } from './pangenomeExamples.ts'

// mygene.info answers in well under a second and a sidecar read in a third of
// one; past this, the button would say "Reading…" for as long as either stalls.
const DEADLINE_MS = 20_000

// The commonest changes the fold lists with their carriers.
const LISTED_CHANGES = 10

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
    const unplaced =
      panel.unplaced > 0
        ? ` ${count(panel.unplaced, 'haplotype')} ${panel.unplaced === 1 ? 'is' : 'are'} not aligned at ${sites === 1 ? 'it' : 'any of them'} and ${panel.unplaced === 1 ? 'has' : 'have'} no lane.`
        : ''
    return `${count(sites, 'structural variant site')} ${sites === 1 ? 'sorts' : 'sort'} the callset's ${haplotypes} haplotypes into ${count(panel.forms, 'form')} that 1% or more carry${shown}.${rare}${unplaced}`
  }
  const agree =
    reading.nonReferenceMajority > 0
      ? `The callset's ${haplotypes} haplotypes share one structure here, which differs from ${referenceLabel} at ${count(reading.nonReferenceMajority, 'site')}.`
      : `The callset's ${haplotypes} haplotypes share ${referenceLabel}'s structure here.`
  return `${agree}${rare}`
}

// One question's answer: the map, one launch, and the rest in a fold. Mounted
// per question, so a focused row belongs to the answer it was picked in.
function Answer({
  answer,
  dataset,
}: {
  answer: RegionAnswer
  dataset: PangenomeDataset
}) {
  const [focus, setFocus] = useState<string>()
  const { region, reading, launches } = answer
  const panel = reading?.panel
  const name = answer.title ?? formatRegion(region)
  const focused = panel?.lanes.find(l => l.haplotype === focus)
  // The Haplotypes launch's own lanes with the focused form's on top, so a form
  // whose lone lane may draw empty (SMN's net 240 kb) still opens beside the
  // others, and the check that boots that launch covers this one.
  const open = focused
    ? haplotypeLanesForRegion(
        dataset,
        { ...region, label: name },
        [
          focused.haplotype,
          ...(panel?.laneHaplotypes ?? []).filter(h => h !== focused.haplotype),
        ],
        focused.haplotype,
      )
    : launches[0]?.url
  const referenceLabel = dataset.reference.label
  const graphOf = focused && changeWindow(focused.marks, region.chrom)
  return (
    <section
      aria-live="polite"
      className="ui-answer"
    >
      <h2>
        {name}{' '}
        <span className="ui-sub">
          {answer.example?.description && `${answer.example.description}, `}
          {formatRegion(region)}
        </span>
      </h2>
      {panel ? (
        <>
          <p className="ui-headline">{headline(panel, referenceLabel)}</p>
          <PangenomeMap
            region={region}
            genes={answer.genes}
            named={answer.named}
            referenceLabel={referenceLabel}
            panel={panel}
            focus={focus}
            onFocus={setFocus}
          />
          {graphOf && dataset.walksUrl && (
            <PangenomeGraph
              walksUrl={dataset.walksUrl}
              region={graphOf.region}
              haplotype={focused.haplotype}
              what={changeName(graphOf.mark)}
            />
          )}
        </>
      ) : (
        reading && <p>{readingSentence(reading, referenceLabel)}</p>
      )}
      {dataset.graphVcf && isWide(region) && (
        <p>
          Only the graph draws a window over {MAX_DETAIL_WINDOW_BP / 1000} kb.
          Narrow it for variants
          {dataset.svStatesUrl ? ' and haplotypes' : ''}.
        </p>
      )}
      {answer.formsError && <p>The structural forms could not be read.</p>}
      {open ? (
        <p className="ui-actions">
          <a
            className="ui-open"
            href={open}
            target="_blank"
            rel="noreferrer"
          >
            Open in JBrowse ↗
          </a>
          {focused && (
            <span className="ui-hint">
              Opens on {focused.label || `${referenceLabel}'s structure`} (
              {focused.haplotype}) ·{' '}
              <button
                type="button"
                className="ui-linkbtn"
                onClick={() => {
                  setFocus(undefined)
                }}
              >
                Clear
              </button>
            </span>
          )}
        </p>
      ) : (
        <p>Nothing draws legibly at this window.</p>
      )}
      <details className="ui-more">
        <summary>More about this window</summary>
        {panel && (
          <>
            <p>{readingSentence(reading, referenceLabel)}</p>
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>Structure</th>
                    <th>Haplotypes</th>
                    <th>Share</th>
                    <th>For example</th>
                  </tr>
                </thead>
                <tbody>
                  {panel.lanes.map(lane => (
                    <tr key={lane.haplotype}>
                      <td>{lane.structure}</td>
                      <td>{lane.shares}</td>
                      <td>
                        {((100 * lane.shares) / panel.placed).toFixed(1)}%
                      </td>
                      <td>
                        <code>{lane.haplotype}</code>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>Change</th>
                    <th>Carriers</th>
                    <th>Of those aligned there</th>
                  </tr>
                </thead>
                <tbody>
                  {panel.changes.slice(0, LISTED_CHANGES).map(c => (
                    <tr key={changeKey(c.mark)}>
                      <td>{changeName(c.mark)}</td>
                      <td>{c.carriers}</td>
                      <td>
                        {(
                          (100 * c.carriers) /
                          alignedAt(panel, c.mark)
                        ).toFixed(1)}
                        %
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="ui-hint">
              Shares are of the {panel.placed} HPRC haplotypes placed here, a
              panel chosen for diversity, not a population sample.
            </p>
          </>
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
      </details>
    </section>
  )
}

// Mounted per question, so the box starts from what was asked and an example
// click replaces what was typed.
function RegionForm({
  asked,
  taxId,
  placeholder,
  busy,
  onAsk,
}: {
  asked: string
  taxId: number
  placeholder?: string
  busy: boolean
  onAsk: (text: string) => void
}) {
  const [text, setText] = useState(asked)
  return (
    <form
      className="ui-form"
      onSubmit={e => {
        e.preventDefault()
        onAsk(text)
      }}
    >
      <GeneCombobox
        value={text}
        taxId={taxId}
        placeholder={`Gene or region, e.g. ${placeholder}`}
        onChange={setText}
        onSubmit={onAsk}
      />
      <button
        type="submit"
        className="ui-btn"
        disabled={busy}
      >
        {busy ? 'Reading…' : 'Show'}
      </button>
    </form>
  )
}

// The one control on a pangenome page: a gene or a region in, that window drawn
// out. The question rides in the url as `?region=`, so an answer can be
// linked to and reloads as itself.
export default function PangenomeRegionBox({
  dataset,
  examples,
}: {
  dataset: PangenomeDataset
  examples: PangenomeExample[]
}) {
  const [asked, setAsked] = useUrlState('region', '')
  const {
    data: answer,
    error,
    isValidating,
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

  return (
    <div>
      <RegionForm
        key={asked}
        asked={asked}
        taxId={dataset.reference.taxonId}
        placeholder={examples[0]?.region}
        busy={isValidating}
        onAsk={raw => {
          const text = raw.trim()
          if (text === asked) {
            void mutate()
          } else if (text) {
            setAsked(text)
          }
        }}
      />

      {examples.length > 0 && (
        <p>
          Examples:
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

      {error instanceof Error && (
        <p
          role="alert"
          className="ui-error"
        >
          {error.message}
        </p>
      )}

      {answer && (
        <Answer
          key={`answer ${asked}`}
          answer={answer}
          dataset={dataset}
        />
      )}
    </div>
  )
}
