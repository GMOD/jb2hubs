import { useState } from 'react'

import useSWRImmutable from 'swr/immutable'

import { useUrlState } from '../hooks/useUrlState.ts'
import { LIVE_QUERY } from '../lib/swr.ts'
import GeneCombobox from './GeneCombobox.tsx'
import PangenomeGraph from './PangenomeGraph.tsx'
import PangenomeMap from './PangenomeMap.tsx'
import { cancelled, regionAnswer } from './pangenomeAnswer.ts'
import { haplotypeLanesForRegion } from './pangenomeLinks.ts'
import { MAX_DETAIL_WINDOW_BP, isWide } from './pangenomeLoci.ts'
import {
  MAX_GRAPH_BP,
  alignedAt,
  bp,
  changeKey,
  changeWindow,
  headline,
  nameChange,
  percent,
} from './pangenomePanels.ts'
import { formatRegion } from './pangenomeRegion.ts'

import type { Reading, RegionAnswer } from './pangenomeAnswer.ts'
import type { PangenomeDataset } from './pangenomeDataset.ts'
import type { PangenomeExample } from './pangenomeExamples.ts'
import type { KnownAllele } from './pangenomeKnownAlleles.ts'
import type { StructuralPanel } from './pangenomePanels.ts'

// mygene.info answers in well under a second, a walk-forms read in under 2 s
// at most windows and the sidecar it falls back to in a third of one; past
// this, the button would say "Reading…" for as long as any stalls.
const DEADLINE_MS = 20_000

// The commonest changes the fold lists with their carriers.
const LISTED_CHANGES = 10

function deadlineMessage(e: unknown) {
  return cancelled(e)
    ? `No answer in ${DEADLINE_MS / 1000} s; try again.`
    : e instanceof Error
      ? e.message
      : String(e)
}

const count = (n: number, noun: string) =>
  `${n.toLocaleString('en-US')} ${noun}${n === 1 ? '' : 's'}`

function readingSentence(reading: Reading, referenceLabel: string) {
  const { haplotypes, panel, sites } = reading
  const whose = reading.source === 'walks' ? "graph's" : "callset's"
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
    return `${count(sites, 'structural variant site')} ${sites === 1 ? 'sorts' : 'sort'} the ${whose} ${haplotypes} haplotypes into ${count(panel.forms, 'form')} that 1% or more carry${shown}.${rare}${unplaced}`
  }
  const agree =
    reading.nonReferenceMajority > 0
      ? `The ${whose} ${haplotypes} haplotypes share one structure here, which differs from ${referenceLabel} at ${count(reading.nonReferenceMajority, 'site')}.`
      : `The ${whose} ${haplotypes} haplotypes share ${referenceLabel}'s structure here.`
  return `${agree}${rare}`
}

// A panel this small names its carriers; a larger one counts them.
const NAMED_PANEL_MAX = 30

// A haplotype as a reader knows it: cattle by breed, mouse strains with the
// slash the sidecar's names cannot hold.
const haplotypeName = (dataset: PangenomeDataset, h: string) =>
  dataset.graphVcf?.rows?.labels[h] ??
  h.replace(/_T2T$/, ' (T2T)').replaceAll('_', '/')

function nameList(names: string[]) {
  return names.length <= 2
    ? names.join(' and ')
    : `${names.slice(0, -1).join(', ')} and ${names.at(-1)}`
}

// Who in the window carries each change an allele is drawn as, counted live
// from the forms; the allele's own `inPanel` where the map draws none.
function carriersHere(
  dataset: PangenomeDataset,
  allele: KnownAllele,
  panel: StructuralPanel | undefined,
  placed: string[],
) {
  const said = allele.drawn.flatMap(d => {
    const changes = (panel?.changes ?? []).filter(
      c => panel?.alleleNames[changeKey(c.mark)] === d.label,
    )
    const members = new Set(changes.flatMap(c => c.members))
    if (!panel || members.size === 0) {
      return []
    }
    const others = placed.filter(h => !members.has(h))
    const who =
      placed.length > NAMED_PANEL_MAX
        ? (() => {
            const aligned = alignedAt(panel, changes[0]!.mark)
            return `${members.size} of the ${aligned} haplotypes aligned (${percent(members.size, aligned)})`
          })()
        : others.length > 0 &&
            others.length <= 3 &&
            members.size > others.length
          ? `all but ${nameList(others.map(h => haplotypeName(dataset, h)))}`
          : nameList([...members].map(h => haplotypeName(dataset, h)))
    return [`${d.label}: ${who}`]
  })
  return said.length > 0
    ? `Here, ${said.join('; ')}.`
    : `In this panel: ${allele.inPanel}.`
}

function KnownAlleles({
  dataset,
  alleles,
  panel,
  placed,
}: {
  dataset: PangenomeDataset
  alleles: KnownAllele[]
  panel?: StructuralPanel
  placed: string[]
}) {
  return alleles.map(a => (
    <p
      key={a.id}
      className="ui-allele"
    >
      <strong>{a.name}.</strong> {a.about}{' '}
      {carriersHere(dataset, a, panel, placed)}{' '}
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
  // others, and the check that boots that launch covers this one. A dataset
  // with neither lanes nor walks has nothing a row could open, so its rows are
  // not buttons.
  const focusedLanes =
    focused &&
    haplotypeLanesForRegion(
      dataset,
      { ...region, label: name },
      [
        focused.haplotype,
        ...(panel?.laneHaplotypes ?? []).filter(h => h !== focused.haplotype),
      ],
      focused.haplotype,
    )
  const open = focusedLanes ?? launches[0]?.url
  const referenceLabel = dataset.reference.label
  const graphOf = focused && changeWindow(focused.marks, region.chrom)
  return (
    <section
      aria-live="polite"
      className="ui-answer"
    >
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
        placed={reading?.matrixRows.order ?? []}
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
            onFocus={
              dataset.walksUrl || dataset.graphBrowser.haplotypeLanesTrackId
                ? setFocus
                : undefined
            }
          />
          {graphOf && dataset.walksUrl ? (
            graphOf.region ? (
              <PangenomeGraph
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
// linked to and reloads as itself; a bare visit opens the first example.
export default function PangenomeRegionBox({
  dataset,
  examples,
}: {
  dataset: PangenomeDataset
  examples: PangenomeExample[]
}) {
  const [asked, setAsked] = useUrlState('region', examples[0]?.region ?? '')
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
