import '../styles/pangenome.css'

import { useRef, useState } from 'react'

import GeneCombobox from '../components/GeneCombobox.tsx'
import { useUrlState } from '../hooks/useUrlState.ts'
import { LIVE_QUERY, useSWRImmutable } from '../lib/swr.ts'
import PangenomeGraph from './PangenomeGraph.tsx'
import PangenomeMap from './PangenomeMap.tsx'
import {
  cancelled,
  exampleFor,
  focusedLaunch,
  regionAnswer,
  rowsFocusable,
} from './pangenomeAnswer.ts'
import { pangenomeExamples } from './pangenomeExamples.ts'
import { indexSymbols } from './pangenomeGeneIndex.ts'
import { changeWindow, graphRow, nameChange } from './pangenomePanels.ts'
import { carriersHere, readingSentence, spoken } from './pangenomeProse.ts'
import { formatRegion } from './pangenomeRegion.ts'
import { MAX_DETAIL_WINDOW_BP, isWide } from './pangenomeWindow.ts'

import type { RegionAnswer } from './pangenomeAnswer.ts'
import type { PangenomeDataset } from './pangenomeDataset.ts'
import type { PangenomeExample } from './pangenomeExamples.ts'
import type { KnownAllele } from './pangenomeKnownAlleles.ts'
import type { StructuralPanel } from './pangenomePanels.ts'
import type { GraphSequence } from './pangenomeRegion.ts'
import type { CSSProperties } from 'react'

// A gene lookup answers in about a second, a walk-forms read in under 2 s
// at most windows and the sidecar it falls back to in a third of one; past
// this, the button would say "Reading…" for as long as any stalls.
const DEADLINE_MS = 20_000

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

// One question's answer: the map, then one button and the other launches
// beside it. Mounted per question, so a focused row belongs to the answer it
// was picked in.
function Answer({
  answer,
  asked,
  dataset,
}: {
  answer: RegionAnswer
  asked: string
  dataset: PangenomeDataset
}) {
  const [focus, setFocus] = useState<string>()
  const { region, reading, launches } = answer
  const { walksUrl } = dataset
  const panel = reading?.panel
  const located = formatRegion(region)
  const referenceLabel = dataset.reference.label
  const focusable = rowsFocusable(dataset)
  const focused = focus
    ? panel?.rows.find(r => r.haplotype === focus)
    : undefined
  const focusedUrl =
    focus && focused ? focusedLaunch(dataset, answer, focus) : undefined
  const open = focusedUrl ?? launches[0]?.url
  // The window's graph with the focused row lit, else the row a visit opens
  // on, so the page shows a graph before any click. Where the window cannot be
  // drawn, the lit row's own change is, or the opening row's for a row with
  // none, such as the reference's.
  const opening = walksUrl && panel ? graphRow(panel, region.chrom) : undefined
  const lit = focused?.haplotype ? focused : opening
  const litChange =
    (lit && changeWindow(lit.marks, region.chrom)) ??
    (opening && changeWindow(opening.marks, region.chrom))
  return (
    <section className="ui-answer">
      <h2>
        {answer.title ?? located}{' '}
        {answer.title && (
          <span className="ui-sub">
            {[
              ...(answer.example?.description
                ? [answer.example.description]
                : []),
              ...(located === asked ? [] : [located]),
            ].join(', ')}
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
        <PangenomeMap
          region={region}
          genes={answer.genes}
          named={answer.named}
          referenceLabel={referenceLabel}
          panel={panel}
          focus={focus}
          hint={
            focusable
              ? walksUrl
                ? 'Click a row to pick its haplotype'
                : 'Click a row to open its haplotype'
              : undefined
          }
          onFocus={focusable ? setFocus : undefined}
        />
      ) : (
        reading && (
          <p className="ui-hint">{readingSentence(reading, referenceLabel)}</p>
        )
      )}
      {isWide(region) && (
        <p className="ui-hint">
          A window over {MAX_DETAIL_WINDOW_BP / 1000} kb opens in JBrowse only.
          Narrow it to map its forms here.
        </p>
      )}
      {answer.formsError && (
        <p className="ui-note">The structural forms could not be read.</p>
      )}
      {open ? (
        <p className="ui-actions">
          <a
            className="ui-btn"
            href={open}
            target="_blank"
            rel="noreferrer"
          >
            {focusedUrl ? `Open ${focus} in JBrowse ↗` : 'Open in JBrowse ↗'}
          </a>
          {(focusedUrl ? launches : launches.slice(1)).map(l => (
            <a
              key={l.kind}
              href={l.url}
              title={l.about}
              target="_blank"
              rel="noreferrer"
            >
              {l.label} ↗
            </a>
          ))}
        </p>
      ) : (
        <p className="ui-hint">Nothing draws legibly at this window.</p>
      )}
      {panel && lit?.haplotype && walksUrl && (
        <PangenomeGraph
          key={formatRegion(region)}
          walksUrl={walksUrl}
          region={region}
          change={litChange?.region}
          haplotype={lit.haplotype}
          asked={focused !== undefined}
          what={litChange ? nameChange(panel, litChange.mark) : ''}
        />
      )}
    </section>
  )
}

// The text in the box is the question asked until the reader edits it, and a
// draft is of the question it was typed over: an example picked beside the box
// replaces what was typed, with nothing to clear and the input never remounted,
// so Enter leaves the keyboard in it.
function RegionForm({
  asked,
  geneIndexUrl,
  sequences,
  placeholder,
  busy,
  onAsk,
}: {
  asked: string
  geneIndexUrl: string
  sequences: readonly GraphSequence[]
  placeholder?: string
  busy: boolean
  onAsk: (text: string) => void
}) {
  const [draft, setDraft] = useState({ over: asked, text: asked })
  const text = draft.over === asked ? draft.text : asked
  return (
    <form
      className="ui-query-form"
      onSubmit={e => {
        e.preventDefault()
        onAsk(text)
      }}
    >
      <GeneCombobox
        value={text}
        suggest={indexSymbols(geneIndexUrl, sequences)}
        placeholder={
          placeholder ? `Gene or region, e.g. ${placeholder}` : 'Gene or region'
        }
        onChange={typed => {
          setDraft({ over: asked, text: typed })
        }}
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

function ExamplePicker({
  asked,
  examples,
  onAsk,
}: {
  asked: string
  examples: PangenomeExample[]
  onAsk: (text: string) => void
}) {
  return (
    <select
      className="ui-select"
      aria-label="Examples"
      value={exampleFor(examples, asked)?.id ?? ''}
      onChange={e => {
        const picked = examples.find(x => x.id === e.target.value)
        if (picked) {
          onAsk(picked.region)
        }
      }}
    >
      <option
        value=""
        disabled
      >
        Examples ({examples.length})
      </option>
      {examples.map(e => (
        <option
          key={e.id}
          value={e.id}
        >
          {e.label}
        </option>
      ))}
    </select>
  )
}

// The one control on a pangenome page: a gene or a region in, that window drawn
// out. The question rides in the url as `?region=`, so an answer can be
// linked to and reloads as itself; a bare visit opens the first example.
export default function PangenomeRegionBox({
  dataset,
}: {
  dataset: PangenomeDataset
}) {
  const examples = pangenomeExamples(dataset)
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
          : new Error(deadlineMessage(e), { cause: e })
      })
    },
    LIVE_QUERY,
  )
  // The same question again retries it, once its read has ended.
  const ask = (raw: string) => {
    const text = raw.trim()
    if (text === asked) {
      if (!isValidating) {
        void mutate()
      }
    } else if (text) {
      setAsked(text)
    }
  }

  return (
    <div>
      <div className="ui-form">
        <RegionForm
          asked={asked}
          geneIndexUrl={dataset.reference.geneIndexUrl}
          sequences={dataset.graphBrowser.chromosomes}
          placeholder={examples[0]?.region}
          busy={isValidating}
          onAsk={ask}
        />
        {examples.length > 0 && (
          <ExamplePicker
            asked={asked}
            examples={examples}
            onAsk={ask}
          />
        )}
      </div>

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
          asked={asked}
          dataset={dataset}
        />
      )}
    </div>
  )
}
