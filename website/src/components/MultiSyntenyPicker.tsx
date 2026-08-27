import { useMemo, useState } from 'react'

import {
  MAX_PICKED_GENOMES,
  planFromSelection,
  suggestedSelection,
  syntenyCandidates,
} from './multiSyntenyPicker.ts'
import { buildMultiSyntenyUrl } from './orthologSearchUtils.ts'

import type { OrthologResult } from './orthologSearchUtils.ts'
import type { PairIndex } from './syntenyPairIndex.ts'

interface Props {
  results: OrthologResult[]
  refResult: OrthologResult
  pairIndex: PairIndex
  lineages: Map<number, Set<number>> | undefined
}

function speciesLabel(r: OrthologResult) {
  return r.assembly.commonName
    ? `${r.assembly.scientificName} (${r.assembly.commonName})`
    : r.assembly.scientificName
}

// The multi-species synteny launch and the picker that decides what goes in it.
//
// A LinearSyntenyView is a linear stack, so the launch is a path: adjacent rows
// need a synteny track between them, and each genome appears once. That is why
// this offers a choice rather than one inferred answer — the catalog admits many
// paths and only the reader knows which comparison they came for.
export default function MultiSyntenyPicker({
  results,
  refResult,
  pairIndex,
  lineages,
}: Props) {
  // null until the reader touches a checkbox, so the suggestion keeps following
  // the data: a new search re-groups and re-suggests instead of carrying a stale
  // selection over.
  const [chosen, setChosen] = useState<Set<string> | null>(null)
  const [open, setOpen] = useState(false)

  const candidates = useMemo(
    () =>
      syntenyCandidates(
        results,
        refResult.assembly.accession,
        refResult.assembly.taxonId,
        pairIndex,
        lineages,
      ),
    [results, refResult, pairIndex, lineages],
  )

  const suggested = useMemo(
    () => suggestedSelection(candidates, refResult, pairIndex),
    [candidates, refResult, pairIndex],
  )
  const selected = chosen ?? suggested

  const { plan, unplaced } = useMemo(
    () => planFromSelection(candidates, refResult, selected, pairIndex),
    [candidates, refResult, selected, pairIndex],
  )

  // Two genomes is the per-row "Synteny" link the table already has; the
  // multi-species launch earns its place from three up.
  if (candidates.length < 2) {
    return null
  }

  // The lineages are a second NCBI call, a second behind the rows. Rendering
  // without them is not a lesser version of this panel: with every species
  // scoring 0 against the reference the list falls back to alphabetical, which
  // is the arbitrary answer this replaced, and then it rearranges under the
  // reader when the fetch lands. The table itself degrades gracefully through
  // the same wait, because one flat group is still the right rows.
  if (!lineages) {
    return (
      <p className="orthologs-summary ui-hint">
        Working out which species sit closest to{' '}
        <em>{refResult.assembly.scientificName}</em>…
      </p>
    )
  }

  const atCap = selected.size >= MAX_PICKED_GENOMES
  const toggle = (accession: string) => {
    const next = new Set(selected)
    if (!next.delete(accession)) {
      next.add(accession)
    }
    setChosen(next)
  }

  return (
    <div className="orthologs-multi">
      <p className="orthologs-summary">
        {plan && plan.rows.length >= 3 ? (
          <>
            <a
              href={buildMultiSyntenyUrl(plan)}
              target="_blank"
              rel="noreferrer"
            >
              Launch multi-species synteny view
            </a>{' '}
            <span className="orthologs-chain">
              {plan.rows.map(r => r.assembly.scientificName).join(' → ')}
            </span>
          </>
        ) : (
          <span className="ui-hint">
            Pick at least two species that chain to{' '}
            <em>{refResult.assembly.scientificName}</em> to launch a
            multi-species view.
          </span>
        )}
      </p>

      {unplaced.length > 0 && (
        <p className="orthologs-note">
          No room in the stack for{' '}
          {unplaced.map(r => r.assembly.scientificName).join(', ')}: the view is
          a single chain, and every genome in it needs a synteny track to its
          neighbour.
        </p>
      )}

      <button
        className="ui-btn-secondary orthologs-multi-toggle"
        aria-expanded={open}
        onClick={() => {
          setOpen(!open)
        }}
      >
        {open ? '▾' : '▸'} Choose species ({selected.size} of{' '}
        {candidates.length})
      </button>

      {open && (
        <div className="orthologs-picker">
          <p className="ui-hint">
            Ordered by how much of its NCBI lineage each species shares with{' '}
            <em>{refResult.assembly.scientificName}</em>, which always leads the
            stack. At most {MAX_PICKED_GENOMES} — a stacked view draws one whole
            genome browser per genome.
          </p>
          <ul className="orthologs-picker-list">
            {candidates.map(r => {
              const accession = r.assembly.accession
              const isOn = selected.has(accession)
              const isUnplaced = unplaced.some(
                u => u.assembly.accession === accession,
              )
              return (
                <li key={accession}>
                  <label
                    className={
                      isUnplaced
                        ? 'orthologs-pick orthologs-pick-unplaced'
                        : 'orthologs-pick'
                    }
                    title={
                      isUnplaced
                        ? 'Selected, but nothing in the stack has a synteny track to it'
                        : undefined
                    }
                  >
                    <input
                      type="checkbox"
                      checked={isOn}
                      disabled={!isOn && atCap}
                      onChange={() => {
                        toggle(accession)
                      }}
                    />
                    {speciesLabel(r)}
                  </label>
                </li>
              )
            })}
          </ul>
          <button
            className="ui-btn-secondary"
            disabled={chosen === null}
            onClick={() => {
              setChosen(null)
            }}
          >
            Reset to suggested
          </button>
        </div>
      )}
    </div>
  )
}
