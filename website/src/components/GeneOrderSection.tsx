import { useMemo } from 'react'

import useSWRImmutable from 'swr/immutable'

import { useResetOnChange } from '../hooks/useResetOnChange.ts'
import { useUrlState } from '../hooks/useUrlState.ts'
import { LIVE_QUERY } from '../lib/swr.ts'
import ErrorWithRetry from './ErrorWithRetry.tsx'
import MultiSyntenyView from './MultiSyntenyView.tsx'
import { MAX_SPECIES, choice, trimNeighborhood } from './geneHub.ts'
import {
  ANCHOR_CHOICES,
  DEFAULT_FLANK_BP,
  DEFAULT_MAX_ANCHORS,
  FLANK_CHOICES_BP,
} from './neighborhood.ts'
import { getNeighborhood } from './neighborhoodClient.ts'

import type { GeneIdentity } from './geneHub.ts'
import type { DrilldownData } from './multiSyntenyDrilldown.ts'

const INITIAL_SPECIES = 15

const BUILD_NOTE =
  'A gene someone has looked at before lands in about a second; the first build of a gene takes 10–20 s of NCBI lookups and is then cached for everyone.'

export default function GeneOrderSection({
  identity,
  drilldown,
}: {
  identity: GeneIdentity
  drilldown: DrilldownData | undefined
}) {
  const [anchorsParam, setAnchorsParam] = useUrlState(
    'anchors',
    String(DEFAULT_MAX_ANCHORS),
  )
  const [flankParam, setFlankParam] = useUrlState(
    'flank',
    String(DEFAULT_FLANK_BP),
  )
  const [modeParam, setMode] = useUrlState('layout', 'ordinal')
  const maxAnchors = choice(ANCHOR_CHOICES, anchorsParam, DEFAULT_MAX_ANCHORS)
  const flankBp = choice(FLANK_CHOICES_BP, flankParam, DEFAULT_FLANK_BP)
  const { symbol, geneId, refTaxId } = identity
  const [expanded, setExpanded] = useResetOnChange(
    `${geneId}|${refTaxId}`,
    false,
  )
  const maxRows = expanded ? MAX_SPECIES : INITIAL_SPECIES

  // Asked for by GeneID, which the assembler passes straight through: the
  // Lambda's cache key names the gene the header names. Sending the symbol had
  // the Lambda resolve it a second time, where a Datasets failure once cached
  // the wrong gene under the right name.
  //
  // keepPreviousData holds the figure on screen while an anchors or flank
  // change rebuilds it; a figure of the previous gene is dropped instead.
  const { data, error, isValidating, mutate } = useSWRImmutable(
    ['neighborhood', geneId, refTaxId, maxAnchors, flankBp],
    ([, g, r, a, f]) => getNeighborhood(g, r, { maxAnchors: a, flankBp: f }),
    { ...LIVE_QUERY, keepPreviousData: true },
  )
  const current =
    data?.query.geneId === geneId &&
    data.query.refTaxonId === refTaxId &&
    !error
      ? data
      : undefined
  const trimmed = useMemo(
    () => (current ? trimNeighborhood(current, maxRows) : undefined),
    [current, maxRows],
  )
  const nb = trimmed?.nb
  const eligible = trimmed?.eligible ?? 0

  const building = isValidating && (
    <p
      className="ui-hint"
      title={BUILD_NOTE}
    >
      Building the {symbol} neighborhood…
    </p>
  )

  return (
    <section>
      <div className="msv-options">
        <label className="msv-option">
          Genes
          <select
            className="ui-select"
            value={maxAnchors}
            onChange={e => {
              setAnchorsParam(e.target.value)
            }}
            title="The query gene plus its nearest protein-coding neighbors"
          >
            {ANCHOR_CHOICES.map(n => (
              <option
                key={n}
                value={n}
              >
                {n}
              </option>
            ))}
          </select>
        </label>
        <label className="msv-option">
          Search window
          <select
            className="ui-select"
            value={flankBp}
            onChange={e => {
              setFlankParam(e.target.value)
            }}
            title="How far each side of the query gene to look for neighbors"
          >
            {FLANK_CHOICES_BP.map(bp => (
              <option
                key={bp}
                value={bp}
              >
                ±{bp / 1000} kb
              </option>
            ))}
          </select>
        </label>
        <span className="msv-option">
          Layout
          <span className="msv-modes">
            <button
              className={modeParam !== 'bp' ? 'active' : ''}
              aria-pressed={modeParam !== 'bp'}
              onClick={() => {
                setMode('ordinal')
              }}
              title="Place genes in equal-width slots by order, ignoring distances"
            >
              ordinal
            </button>
            <button
              className={modeParam === 'bp' ? 'active' : ''}
              aria-pressed={modeParam === 'bp'}
              onClick={() => {
                setMode('bp')
              }}
              title="Place genes at their genomic positions, at the reference's scale; a row spanning more is shrunk to fit, its span printed at its right end"
            >
              bp-scaled
            </button>
          </span>
        </span>
      </div>
      <ErrorWithRetry
        error={error}
        onRetry={() => {
          void mutate()
        }}
        className="ui-error"
      />
      {!current && !error && <div className="msv-placeholder">{building}</div>}
      {current && building}
      {nb?.species.length === 0 && !isValidating && (
        <p className="ui-hint">No informative ortholog neighborhoods found.</p>
      )}
      {nb && nb.species.length > 0 && (
        <p className="ui-hint">
          Hover a gene to trace it. Click a gene to open it in JBrowse.
        </p>
      )}
      {nb && nb.species.length > 0 && (
        <MultiSyntenyView
          neighborhood={nb}
          drilldown={drilldown}
          mode={modeParam === 'bp' ? 'bp' : 'ordinal'}
        />
      )}
      {nb && !expanded && eligible > INITIAL_SPECIES && (
        <button
          className="ui-linkbtn"
          title="Showing the reference’s closest relatives, the model organisms and a sample of every clade further out"
          onClick={() => {
            setExpanded(true)
          }}
        >
          Show {Math.min(eligible, MAX_SPECIES)} species
        </button>
      )}
    </section>
  )
}
