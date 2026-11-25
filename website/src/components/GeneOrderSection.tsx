import '../styles/geneOrder.css'

import { useMemo } from 'react'

import { useUrlState } from '../hooks/useUrlState.ts'
import { LIVE_QUERY, useSWRImmutable } from '../lib/swr.ts'
import ErrorWithRetry from './ErrorWithRetry.tsx'
import MultiSyntenyView from './MultiSyntenyView.tsx'
import { choice } from './geneHub.ts'
import {
  ANCHOR_CHOICES,
  DEFAULT_FLANK_BP,
  DEFAULT_MAX_ANCHORS,
  FLANK_CHOICES_BP,
} from './neighborhood.ts'
import { getNeighborhood } from './neighborhoodClient.ts'
import {
  MAX_SPECIES,
  referenceFirst,
  trimNeighborhood,
} from './neighborhoodTrim.ts'

import type { GeneIdentity } from './geneHub.ts'
import type { DrilldownData } from './multiSyntenyDrilldown.ts'

const INITIAL_SPECIES = 15

// The chromosome as a reader names it: "chr17", or the accession of a sequence
// NCBI has not placed
function sequenceName(chromosome: string, refName: string) {
  return /^unplaced|^unlocalized/i.test(chromosome)
    ? refName
    : /^[0-9A-Z]{1,3}$/.test(chromosome)
      ? `chr${chromosome}`
      : chromosome
}

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
  const [rowsParam, setRowsParam] = useUrlState(
    'species',
    String(INITIAL_SPECIES),
  )
  const expanded = rowsParam === String(MAX_SPECIES)
  const maxRows = expanded ? MAX_SPECIES : INITIAL_SPECIES

  // Asked for by GeneID, which the assembler passes straight through: the
  // Lambda's cache key names the gene the header names. Sending the symbol had
  // the Lambda resolve it a second time, where a Datasets failure once cached
  // the wrong gene under the right name.
  //
  // keepPreviousData holds the figure on screen while an anchors or flank
  // change rebuilds it. The page keys this section by gene, so a figure of the
  // previous gene is never held.
  const { data, error, isValidating, mutate } = useSWRImmutable(
    ['neighborhood', geneId, refTaxId, maxAnchors, flankBp],
    ([, g, r, a, f]) => getNeighborhood(g, r, { maxAnchors: a, flankBp: f }),
    { ...LIVE_QUERY, keepPreviousData: true },
  )
  const current = error ? undefined : data
  const trimmed = useMemo(
    () => (current ? trimNeighborhood(current, maxRows) : undefined),
    [current, maxRows],
  )
  const nb = useMemo(
    () => (trimmed ? referenceFirst(trimmed.nb) : undefined),
    [trimmed],
  )
  const eligible = trimmed?.eligible ?? 0
  const refGene = nb?.species
    .find(sp => sp.taxonId === refTaxId)
    ?.genes.find(g => g.anchorId === geneId)
  const refSpecies = nb?.species.find(sp => sp.taxonId === refTaxId)

  const building = isValidating && (
    <p
      className="ui-hint"
      title={BUILD_NOTE}
    >
      Building the {symbol} neighborhood…
    </p>
  )

  const neighbors = (nb?.anchors.length ?? 1) - 1
  const windowHoldsFewer = !isValidating && neighbors < maxAnchors - 1
  const place = refGene
    ? ` on ${refSpecies?.commonName ?? refSpecies?.scientificName ?? 'the reference'} ${sequenceName(refGene.chromosome, refGene.refName)}`
    : ''
  const referenceAlone =
    current !== undefined &&
    current.anchors.length > 1 &&
    current.species.every(sp => sp.taxonId === refTaxId)
  return (
    <section>
      <div className="msv-caption">
        <span>
          {nb && nb.species.length > 0 && (
            <>
              {windowHoldsFewer
                ? `${symbol} and the ${neighbors} protein-coding gene${neighbors === 1 ? '' : 's'} within ±${flankBp / 1000} kb of it`
                : `${symbol} and its ${neighbors} nearest neighbors`}
              {place} · {nb.species.length} of {eligible} species
            </>
          )}
        </span>
        <span className="msv-controls">
          <label className="msv-option">
            Neighbors
            <select
              className="ui-select"
              value={maxAnchors}
              onChange={e => {
                setAnchorsParam(e.target.value)
              }}
              title="How many of the nearest protein-coding genes to draw beside the query"
            >
              {ANCHOR_CHOICES.map(n => (
                <option
                  key={n}
                  value={n}
                >
                  {n - 1}
                </option>
              ))}
            </select>
          </label>
          <label className="msv-option">
            Window
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
            Spacing
            <span className="msv-modes">
              <button
                className={modeParam !== 'bp' ? 'active' : ''}
                aria-pressed={modeParam !== 'bp'}
                onClick={() => {
                  setMode('ordinal')
                }}
                title="Each gene in its reference gene's column, distances ignored"
              >
                even
              </button>
              <button
                className={modeParam === 'bp' ? 'active' : ''}
                aria-pressed={modeParam === 'bp'}
                onClick={() => {
                  setMode('bp')
                }}
                title="Genes at their genomic positions, at the reference's scale; a row spanning more is shrunk to fit, its span printed at its right end"
              >
                to scale
              </button>
            </span>
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
      {nb?.species.length === 0 &&
        !isValidating &&
        (nb.anchors.length === 1 ? (
          <p className="ui-hint">
            No protein-coding gene lies within ±{flankBp / 1000} kb of {symbol}{' '}
            in the reference. A wider window may reach its neighbors.
          </p>
        ) : (
          <p className="ui-hint">
            No species draws two of these genes together.
          </p>
        ))}
      {referenceAlone && !isValidating && (
        <p className="ui-hint">
          NCBI calls no ortholog of {symbol} or its neighbors in another
          species, so there is nothing to compare the reference with.
        </p>
      )}
      {current && nb && nb.species.length > 0 && (
        <>
          <MultiSyntenyView
            neighborhood={nb}
            allSpecies={current.species}
            drilldown={drilldown}
            mode={modeParam === 'bp' ? 'bp' : 'ordinal'}
          >
            {eligible > INITIAL_SPECIES && (
              <button
                className="ui-linkbtn"
                title="The reference’s closest relatives, the model organisms and a sample of the clades further out"
                onClick={() => {
                  setRowsParam(String(expanded ? INITIAL_SPECIES : MAX_SPECIES))
                }}
              >
                {expanded
                  ? `Show ${INITIAL_SPECIES} species`
                  : `Show ${Math.min(eligible, MAX_SPECIES)} species`}
              </button>
            )}
          </MultiSyntenyView>
          <p className="msv-note">
            A crossing ribbon is a change of gene order. A row whose genes run
            the other way is mirrored to read in the reference’s order. Hover a
            gene to trace it, click it to open it in JBrowse.
          </p>
          <p className="msv-note">
            Each row is NCBI’s ortholog calls for one species, one gene per
            species, so a gap is not proof of a difference. A blank means NCBI
            pairs no gene there with the reference’s: the gene may be lost, or
            it may be unannotated, in an assembly gap, or a duplicate NCBI left
            unpaired. NCBI weighs a gene’s neighbors when it pairs orthologs, so
            a gene that has moved is more likely to go unpaired. A dashed box is
            a gene placed elsewhere in that genome: on another chromosome, far
            along this one, or on a scaffold the assembly has not placed, which
            need not be a rearrangement.
          </p>
        </>
      )}
    </section>
  )
}
