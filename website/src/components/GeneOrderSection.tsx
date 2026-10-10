import { useMemo } from 'react'

import useSWRImmutable from 'swr/immutable'

import { useUrlState } from '../hooks/useUrlState.ts'
import { LIVE_QUERY } from '../lib/swr.ts'
import ErrorWithRetry from './ErrorWithRetry.tsx'
import MultiSyntenyView from './MultiSyntenyView.tsx'
import { choice, trimNeighborhood } from './geneHub.ts'
import {
  ANCHOR_CHOICES,
  DEFAULT_FLANK_BP,
  DEFAULT_MAX_ANCHORS,
  FLANK_CHOICES_BP,
} from './neighborhood.ts'
import { getNeighborhood } from './neighborhoodClient.ts'

import type { GeneIdentity } from './geneHub.ts'
import type { DrilldownData } from './multiSyntenyDrilldown.ts'

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
  const maxAnchors = choice(ANCHOR_CHOICES, anchorsParam, DEFAULT_MAX_ANCHORS)
  const flankBp = choice(FLANK_CHOICES_BP, flankParam, DEFAULT_FLANK_BP)
  const { symbol, geneId, refTaxId } = identity

  // Asked for by GeneID, which the assembler passes straight through, so the
  // figure is of the gene the header names and the Lambda's cache key names
  // that gene too. Sending the symbol had the Lambda resolve it a second time,
  // where a Datasets failure once cached the wrong gene under the right name.
  //
  // keepPreviousData holds the figure on screen while an anchors or flank
  // change rebuilds it; a figure of the previous gene is dropped instead,
  // since it would sit under this gene's heading for the 1–20 s a build takes.
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
    () => (current ? trimNeighborhood(current) : undefined),
    [current],
  )
  const nb = trimmed?.nb
  const eligible = trimmed?.eligible ?? 0

  return (
    <section className="gene-section">
      <div className="gene-section-head">
        <h2>Conserved gene order</h2>
        <select
          className="ui-select"
          value={maxAnchors}
          onChange={e => {
            setAnchorsParam(e.target.value)
          }}
          title="How many genes to show: the query gene plus its nearest protein-coding neighbors"
        >
          {ANCHOR_CHOICES.map(n => (
            <option
              key={n}
              value={n}
            >
              {n} genes
            </option>
          ))}
        </select>
        <select
          className="ui-select"
          value={flankBp}
          onChange={e => {
            setFlankParam(e.target.value)
          }}
          title="Search window each side of the query gene for neighbor genes"
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
      </div>
      <p className="ui-hint">
        {symbol} and its protein-coding neighbors across every species with an
        annotated ortholog, ordered by the NCBI taxonomy — ribbons connect the
        orthologs, so crossings and inversions are local rearrangements.
      </p>
      {isValidating && (
        <p className="ui-hint">
          Building the {symbol} neighborhood. A gene someone has looked at
          before lands in about a second; the first build of a gene takes 10–20
          s of NCBI lookups and is then cached for everyone.
        </p>
      )}
      <ErrorWithRetry
        error={error}
        onRetry={() => {
          void mutate()
        }}
        className="ui-error"
      />
      {nb?.species.length === 0 && !isValidating && (
        <p className="ui-hint">No informative ortholog neighborhoods found.</p>
      )}
      {nb && eligible > nb.species.length && (
        <p className="ui-hint">
          Showing {nb.species.length} of the {eligible} species with orthologs
          here: the reference&rsquo;s closest relatives, the model organisms,
          and a sample of every clade further out.
        </p>
      )}
      {nb && nb.species.length > 0 && (
        <MultiSyntenyView
          neighborhood={nb}
          drilldown={drilldown}
        />
      )}
    </section>
  )
}
