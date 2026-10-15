import { useRef, useState } from 'react'

import useSWRImmutable from 'swr/immutable'

import { useUrlState } from '../hooks/useUrlState.ts'
import { LIVE_QUERY } from '../lib/swr.ts'
import ErrorMessage from './ErrorMessage.tsx'
import ErrorWithRetry from './ErrorWithRetry.tsx'
import GeneCombobox from './GeneCombobox.tsx'
import {
  EXAMPLES,
  HUMAN_TAXON,
  localRef,
  resolveGeneIdentity,
} from './geneHub.ts'
import { COMMON_SPECIES, refLabel } from './orthologSearchUtils.ts'
import { resolveRefTaxon } from './orthologSet.ts'

import type { GeneIdentity } from './geneHub.ts'
import type { ReactNode } from 'react'

function field(fd: FormData, name: string) {
  const v = fd.get(name)
  return typeof v === 'string' ? v.trim() : ''
}

// The URL is the query — ?gene=TP53&ref=9606, the contract every gene-first
// page shares. The gene is resolved once off what it says, so a view is
// shareable and survives a reload. useUrlState replaces the history entry
// rather than pushing one, so Back leaves the page instead of stepping through
// earlier searches.
export function useGeneQuery() {
  const [geneParam, setGeneParam] = useUrlState('gene', '')
  const [refParam, setRefParam] = useUrlState('ref', String(HUMAN_TAXON))
  const gene = geneParam.trim()
  const ref = localRef(refParam)
  const { data, error, isLoading, mutate } = useSWRImmutable(
    gene ? ['gene', gene, ref] : null,
    ([, g, r]) => resolveGeneIdentity(g, r),
    LIVE_QUERY,
  )
  return {
    gene,
    ref,
    identity: data,
    error: error as unknown,
    isLoading,
    retry: () => {
      void mutate()
    },
    show: (symbol: string, taxId: number) => {
      setGeneParam(symbol)
      setRefParam(String(taxId))
    },
  }
}

export type GeneQuery = ReturnType<typeof useGeneQuery>

function GeneField({
  initial,
  taxId,
  onPick,
}: {
  initial: string
  taxId: number
  onPick: (symbol: string) => void
}) {
  const [text, setText] = useState(initial)
  return (
    <GeneCombobox
      id="gene-input"
      name="gene"
      required
      value={text}
      taxId={taxId}
      placeholder="e.g. BRCA1 or 672"
      onChange={setText}
      onSubmit={onPick}
    />
  )
}

// The gene box, the reference species box, the example chips and the lookup's
// own errors. Submitting resolves the reference to a taxon id before writing
// the URL.
export default function GeneQueryForm({
  query,
  help,
}: {
  query: GeneQuery
  help?: ReactNode
}) {
  const { gene, ref, identity, error, isLoading, retry, show } = query
  const [refError, setRefError] = useState<unknown>(undefined)
  const [typedRef, setTypedRef] = useState<{ taxId: string; text: string }>()
  const [refPending, setRefPending] = useState(false)
  // Bumped by every submit and every chip, so a species lookup that answers
  // after something newer was asked for is dropped rather than applied.
  const latestRequest = useRef(0)
  const formRef = useRef<HTMLFormElement>(null)

  // A numeric GeneID names its own organism, which may not be the one in the
  // box: the box follows the gene, and so does the next search from it.
  const boxRef =
    identity && String(identity.refTaxId) !== ref
      ? String(identity.refTaxId)
      : ref
  const refText = refBoxText(boxRef, typedRef, identity)

  function pick(symbol: string, taxId: number) {
    latestRequest.current += 1
    setRefPending(false)
    setRefError(undefined)
    show(symbol, taxId)
  }

  async function submit(fd: FormData) {
    const g = field(fd, 'gene')
    const typed = field(fd, 'ref')
    if (g && typed) {
      latestRequest.current += 1
      const request = latestRequest.current
      setRefPending(true)
      setRefError(undefined)
      try {
        const taxId =
          typed === refText && /^\d+$/.test(boxRef)
            ? Number(boxRef)
            : await resolveRefTaxon(typed)
        if (request === latestRequest.current) {
          pick(g, taxId)
          if (!/^\d+$/.test(typed)) {
            setTypedRef({ taxId: String(taxId), text: typed })
          }
          if (error && g === gene && String(taxId) === ref) {
            retry()
          }
        }
      } catch (err) {
        if (request === latestRequest.current) {
          setRefPending(false)
          setRefError(err)
        }
      }
    }
  }

  return (
    <>
      <div className="ui-form ui-form-labeled">
        <form
          ref={formRef}
          style={{ display: 'contents' }}
          onSubmit={e => {
            e.preventDefault()
            void submit(new FormData(e.currentTarget))
          }}
        >
          <div className="ui-field">
            <label
              htmlFor="gene-input"
              className="ui-field-label"
            >
              Gene symbol
            </label>
            <GeneField
              key={gene}
              initial={gene}
              taxId={/^\d+$/.test(boxRef) ? Number(boxRef) : HUMAN_TAXON}
              onPick={symbol => {
                if (formRef.current) {
                  const fd = new FormData(formRef.current)
                  fd.set('gene', symbol)
                  void submit(fd)
                }
              }}
            />
          </div>
          <div className="ui-field">
            <label
              htmlFor="species-input"
              className="ui-field-label"
            >
              Reference species
            </label>
            <input
              id="species-input"
              key={refText}
              name="ref"
              className="ui-select"
              list="gene-ref-species"
              defaultValue={refText}
              placeholder="Species name or taxid"
              title="Any species name or NCBI taxon id — common model organisms are suggested"
              required
            />
            <datalist id="gene-ref-species">
              {COMMON_SPECIES.map(s => (
                <option
                  key={s.taxId}
                  value={s.label}
                />
              ))}
            </datalist>
          </div>
          <button
            type="submit"
            className="ui-btn"
            disabled={refPending}
          >
            {refPending ? 'Resolving…' : 'Search'}
          </button>
        </form>
        {help}
      </div>

      <p className="ui-hint">
        Try an example:{' '}
        {EXAMPLES.map(g => (
          <button
            key={g}
            type="button"
            className="ui-chip-btn"
            onClick={() => {
              pick(g, HUMAN_TAXON)
            }}
          >
            {g}
          </button>
        ))}
      </p>

      <ErrorMessage
        error={refError}
        className="ui-error"
      />
      <ErrorWithRetry
        error={error}
        onRetry={retry}
        className="ui-error"
      />
      {isLoading && (
        <p className="ui-hint">
          Looking up {gene} in {refText}…
        </p>
      )}
    </>
  )
}

// What the species box shows for the reference: a suggested species' label,
// the name it was typed as, or, for a taxon id that came in a link, the species
// NCBI's gene record names. A bare taxon id only where no name is known.
function refBoxText(
  ref: string,
  typed: { taxId: string; text: string } | undefined,
  identity: GeneIdentity | undefined,
) {
  const label = refLabel(ref)
  if (label !== ref) {
    return label
  }
  if (typed?.taxId === ref) {
    return typed.text
  }
  return identity?.species && String(identity.refTaxId) === ref
    ? identity.species
    : ref
}
