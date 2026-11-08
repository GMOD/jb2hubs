import '../styles/pangenome.css'

import { useRef, useState } from 'react'

import useSWRImmutable from 'swr/immutable'

import { useUrlState } from '../hooks/useUrlState.ts'
import { LIVE_QUERY } from '../lib/swr.ts'
import GeneCombobox from './GeneCombobox.tsx'
import PangenomeGraph from './PangenomeGraph.tsx'
import PangenomeMap from './PangenomeMap.tsx'
import {
  cancelled,
  focusedLaunch,
  regionAnswer,
  rowsFocusable,
} from './pangenomeAnswer.ts'
import { indexSymbols } from './pangenomeGeneIndex.ts'
import { MAX_DETAIL_WINDOW_BP, isWide } from './pangenomeLoci.ts'
import {
  MAX_GRAPH_BP,
  alignedAt,
  changeKey,
  changeWindow,
  nameChange,
} from './pangenomePanels.ts'
import {
  bp,
  carriersHere,
  headline,
  percent,
  readingSentence,
  spoken,
} from './pangenomeProse.ts'
import { formatRegion } from './pangenomeRegion.ts'

import type { RegionAnswer } from './pangenomeAnswer.ts'
import type { PangenomeDataset } from './pangenomeDataset.ts'
import type { PangenomeExample } from './pangenomeExamples.ts'
import type { KnownAllele } from './pangenomeKnownAlleles.ts'
import type { StructuralPanel } from './pangenomePanels.ts'
import type { CSSProperties } from 'react'

// A gene lookup answers in about a second, a walk-forms read in under 2 s
// at most windows and the sidecar it falls back to in a third of one; past
// this, the button would say "Reading…" for as long as any stalls.
const DEADLINE_MS = 20_000

// The commonest changes the fold lists with their carriers.
const LISTED_CHANGES = 10

class Dropped extends Error {
  constructor() {
    super('another question replaced this one')
    this.name = 'Dropped'
  }
}

function deadlineMessage(e: unknown) {
  return cancelled(e)
    ? `No answer in ${DEADLINE_MS / 1000} s; try again.`
    : e instanceof Error
      ? e.message
      : String(e)
}

function KnownAlleles({
  dataset,
  alleles,
  panel,
  panelHaplotypes,
}: {
  dataset: PangenomeDataset
  alleles: KnownAllele[]
  panel?: StructuralPanel
  panelHaplotypes: string[]
}) {
  return alleles.map(a => (
    <p
      key={a.id}
      className="ui-allele"
    >
      <strong>{a.name}.</strong> {a.about}{' '}
      {carriersHere(dataset, a, panel, panelHaplotypes)}{' '}
      <span className="ui-cite">
        {a.citations.map((c, i) => (
          <span key={c.url}>
            {i > 0 && ' · '}
            <a
              href={c.url}
              target="_blank"
              rel="noreferrer"
            >
              {c.label}
            </a>
          </span>
        ))}
      </span>
    </p>
  ))
}

const SPOKEN_ONLY: CSSProperties = {
  position: 'absolute',
  width: 1,
  height: 1,
  overflow: 'hidden',
  clipPath: 'inset(50%)',
  whiteSpace: 'nowrap',
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
  const focusedLanes =
    focused && focusedLaunch(dataset, answer, focused.haplotype)
  const open = focusedLanes ?? launches[0]?.url
  const referenceLabel = dataset.reference.label
  const graphOf = focused && changeWindow(focused.marks, region.chrom)
  return (
    <section className="ui-answer">
      <h2>
        {name}{' '}
        {answer.title && (
          <span className="ui-sub">
            {answer.example?.description && `${answer.example.description}, `}
            {formatRegion(region)}
          </span>
        )}
      </h2>
      <KnownAlleles
        dataset={dataset}
        alleles={answer.alleles}
        panel={panel}
        panelHaplotypes={reading?.matrixRows.order ?? []}
      />
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
            onFocus={rowsFocusable(dataset) ? setFocus : undefined}
          />
          {graphOf && dataset.walksUrl ? (
            graphOf.region ? (
              <PangenomeGraph
                key={formatRegion(graphOf.region)}
                walksUrl={dataset.walksUrl}
                region={graphOf.region}
                haplotype={focused.haplotype}
                what={nameChange(panel, graphOf.mark)}
              />
            ) : (
              <p className="ui-note">
                No graph: this {nameChange(panel, graphOf.mark)} sits in a{' '}
                {bp(graphOf.mark.end - graphOf.mark.start)} site, wider than the{' '}
                {bp(MAX_GRAPH_BP)} a graph can draw.
              </p>
            )
          ) : null}
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
          {focused && focusedLanes && (
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
                    <th>Change</th>
                    <th>Carriers</th>
                    <th>Of those aligned there</th>
                  </tr>
                </thead>
                <tbody>
                  {panel.changes.slice(0, LISTED_CHANGES).map(c => (
                    <tr key={changeKey(c.mark)}>
                      <td>{nameChange(panel, c.mark)}</td>
                      <td>{c.carriers}</td>
                      <td>{percent(c.carriers, alignedAt(panel, c.mark))}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="ui-hint">
              Shares are of the {panel.placed} haplotypes placed here, a panel
              chosen for diversity, not a population sample.
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
  geneIndexUrl,
  placeholder,
  busy,
  onAsk,
}: {
  asked: string
  geneIndexUrl: string
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
        suggest={indexSymbols(geneIndexUrl)}
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
// linked to and reloads as itself; a bare visit opens the first example.
export default function PangenomeRegionBox({
  dataset,
  examples,
}: {
  dataset: PangenomeDataset
  examples: PangenomeExample[]
}) {
  const [asked, setAsked] = useUrlState('region', examples[0]?.region ?? '')
  const question = useRef<AbortController | undefined>(undefined)
  const {
    data: answer,
    error,
    isValidating,
    mutate,
  } = useSWRImmutable(
    asked ? ['pangenome-region', dataset.id, asked] : null,
    ([, , text]) => {
      question.current?.abort()
      const asking = new AbortController()
      question.current = asking
      return regionAnswer(
        dataset,
        examples,
        text,
        AbortSignal.any([asking.signal, AbortSignal.timeout(DEADLINE_MS)]),
      ).catch((e: unknown) => {
        throw asking.signal.aborted
          ? new Dropped()
          : new Error(deadlineMessage(e))
      })
    },
    LIVE_QUERY,
  )

  return (
    <div>
      <RegionForm
        key={asked}
        asked={asked}
        geneIndexUrl={dataset.reference.geneIndexUrl}
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
                title={[e.description, ...e.alleles].join(' · ')}
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

      {error instanceof Error && !(error instanceof Dropped) && (
        <p
          role="alert"
          className="ui-error"
        >
          {error.message}
        </p>
      )}

      <p
        aria-live="polite"
        style={SPOKEN_ONLY}
      >
        {answer && spoken(answer, dataset.reference.label)}
      </p>

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
