import '../styles/ui.css'

import { useRef, useState } from 'react'

import useSWRImmutable from 'swr/immutable'

import { features } from '../config/features.ts'
import { useTitlePrefix } from '../hooks/useTitlePrefix.ts'
import { useUrlState } from '../hooks/useUrlState.ts'
import { ncbiGeneUrl, ncbiTaxonomyUrl } from '../lib/externalLinks.ts'
import { LIVE_QUERY } from '../lib/swr.ts'
import { LaunchLink } from './DesktopLaunch.tsx'
import ErrorMessage from './ErrorMessage.tsx'
import ErrorWithRetry from './ErrorWithRetry.tsx'
import ExternalLink from './ExternalLink.tsx'
import GeneOrderSection from './GeneOrderSection.tsx'
import HelpButton from './HelpButton.tsx'
import OrthologHelpDialog from './OrthologHelpDialog.tsx'
import OrthologSection from './OrthologSection.tsx'
import {
  EXAMPLES,
  HUMAN_TAXON,
  ensemblUrl,
  fetchOrthologSet,
  fetchReferenceResult,
  localRef,
  resolveGeneIdentity,
  syntenyLaunchUrl,
  uniprotUrl,
} from './geneHub.ts'
import { loadDrilldownData } from './multiSyntenyDrilldown.ts'
import { DEFAULT_SCOPE, scopeById } from './orthologClades.ts'
import {
  COMMON_SPECIES,
  formatNumber,
  geneUrl,
  refLabel,
} from './orthologSearchUtils.ts'
import { resolveRefTaxon } from './orthologSet.ts'

import type { GeneIdentity } from './geneHub.ts'
import type { OrthologResult } from './orthologSearchUtils.ts'
import type { FormEvent } from 'react'

function field(fd: FormData, name: string) {
  const v = fd.get(name)
  return typeof v === 'string' ? v.trim() : ''
}

// The URL is the query — ?gene=TP53&ref=9606, the contract every gene-first
// page shares, plus scope= for the table and anchors=/flank= for the figure.
// Submitting writes it (with the reference resolved to a taxon id first); the
// gene is resolved once off what it says, and every section is keyed on that
// one answer, so a view is shareable and survives a reload. useUrlState
// replaces the history entry rather than pushing one, so Back leaves the page
// instead of stepping through earlier searches.
export default function GenePage() {
  const [geneParam, setGeneParam] = useUrlState('gene', '')
  const [refParam, setRefParam] = useUrlState('ref', String(HUMAN_TAXON))
  const [scopeParam, setScopeParam] = useUrlState('scope', DEFAULT_SCOPE.id)
  const [refError, setRefError] = useState<unknown>(undefined)
  const [typedRef, setTypedRef] = useState<{ taxId: string; text: string }>()
  const [refPending, setRefPending] = useState(false)
  // Bumped by every submit and every chip, so a species lookup that answers
  // after something newer was asked for is dropped rather than applied.
  const latestRequest = useRef(0)
  const [helpOpen, setHelpOpen] = useState(false)

  const gene = geneParam.trim()
  const ref = localRef(refParam)
  const scope = scopeById(scopeParam)

  const {
    data: identity,
    error,
    isLoading,
    mutate: retryIdentity,
  } = useSWRImmutable(
    gene ? ['gene', gene, ref] : null,
    ([, g, r]) => resolveGeneIdentity(g, r),
    LIVE_QUERY,
  )

  // The pair catalog and assembly index behind the table's synteny links and
  // the figure's drill-downs, fetched once there is a gene to show them for. A
  // failed catalog is an error SWR retries, not an empty index kept until reload.
  const { data: drilldown } = useSWRImmutable(
    identity ? 'gene-drilldown' : null,
    loadDrilldownData,
  )

  const orthologs = useSWRImmutable(
    identity ? ['orthologs', identity.geneId, scope.id] : null,
    ([, geneId, scopeId]) => fetchOrthologSet(geneId, scopeById(scopeId).taxa),
    LIVE_QUERY,
  )
  const refResult = orthologs.data?.results.find(
    r => r.assembly.taxonId === identity?.refTaxId,
  )
  // A clade scope that leaves out the reference species leaves its row out of
  // the table too, and with it the genome the Synteny launch opens on, so that
  // is asked for on its own.
  const { data: outOfScopeRef } = useSWRImmutable(
    identity && orthologs.data && !refResult && scope.taxa.length > 0
      ? ['reference-row', identity.geneId, identity.refTaxId]
      : null,
    ([, geneId, refTaxId]) => fetchReferenceResult(geneId, refTaxId),
    LIVE_QUERY,
  )
  // A numeric GeneID names its own organism, which may not be the one in the
  // box: the box follows the gene, and so does the next search from it.
  const boxRef =
    identity && String(identity.refTaxId) !== ref
      ? String(identity.refTaxId)
      : ref
  const refText = refBoxText(boxRef, typedRef, identity)
  useTitlePrefix(identity?.symbol)

  function show(symbol: string, taxId: number) {
    latestRequest.current += 1
    setRefPending(false)
    setRefError(undefined)
    setGeneParam(symbol)
    setRefParam(String(taxId))
  }

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const fd = new FormData(e.currentTarget)
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
          show(g, taxId)
          if (!/^\d+$/.test(typed)) {
            setTypedRef({ taxId: String(taxId), text: typed })
          }
          if (error && g === gene && String(taxId) === ref) {
            void retryIdentity()
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
    <div>
      <div className="ui-form ui-form-labeled">
        <form
          style={{ display: 'contents' }}
          onSubmit={e => {
            void submit(e)
          }}
        >
          <div className="ui-field">
            <label
              htmlFor="gene-input"
              className="ui-field-label"
            >
              Gene symbol
            </label>
            <input
              id="gene-input"
              key={gene}
              name="gene"
              className="ui-input"
              defaultValue={gene}
              placeholder="e.g. BRCA1 or 672"
              required
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
            disabled={isLoading || refPending}
          >
            {isLoading || refPending ? 'Resolving…' : 'Search'}
          </button>
        </form>
        <HelpButton
          label="How this search works"
          onClick={() => {
            setHelpOpen(true)
          }}
        />
      </div>

      {helpOpen && (
        <OrthologHelpDialog
          onClose={() => {
            setHelpOpen(false)
          }}
        />
      )}

      <p className="ui-hint">
        Try an example:{' '}
        {EXAMPLES.map(g => (
          <button
            key={g}
            type="button"
            className="ui-chip-btn"
            onClick={() => {
              show(g, HUMAN_TAXON)
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
        onRetry={() => {
          void retryIdentity()
        }}
        className="ui-error"
      />
      {isLoading && (
        <p className="ui-hint">
          Resolving {gene} in {refText}…
        </p>
      )}

      {identity && (
        <>
          <IdentityHeader
            identity={identity}
            refRow={refResult ?? outOfScopeRef}
          />
          <OrthologSection
            identity={identity}
            scope={scope}
            onScope={id => {
              setScopeParam(id)
            }}
            orthologs={orthologs.data}
            error={orthologs.error}
            loading={orthologs.isLoading}
            onRetry={() => {
              void orthologs.mutate()
            }}
            refResult={refResult}
            drilldown={drilldown}
          />
          {features.multiSynteny && (
            <GeneOrderSection
              identity={identity}
              drilldown={drilldown}
            />
          )}
          <LaunchCards
            identity={identity}
            refResult={refResult ?? outOfScopeRef}
          />
        </>
      )}
    </div>
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

// What the gene actually is, from the report the resolution already made. A
// symbol alone doesn't tell you whether you got the gene you meant; the
// description, the cytogenetic band and the alias list do. Once the ortholog
// rows land, the reference's own row puts the gene on the genome we host, one
// click from JBrowse whether or not the table's clade scope shows that row.
function IdentityHeader({
  identity,
  refRow,
}: {
  identity: GeneIdentity
  refRow: OrthologResult | undefined
}) {
  const {
    symbol,
    description,
    species,
    commonName,
    mapLocation,
    geneId,
    refTaxId,
    aliases,
    uniprotAccession,
  } = identity
  return (
    <div className="orthologs-gene-card">
      <h2 className="orthologs-gene-title">
        {symbol}
        {description ? (
          <span className="orthologs-gene-desc"> {description}</span>
        ) : null}
      </h2>
      <p className="orthologs-gene-meta">
        {species ? <em>{species}</em> : `taxon ${refTaxId}`}
        {commonName ? ` (${commonName})` : ''}
        {mapLocation ? ` · ${mapLocation}` : ''}
        {' · '}
        <ExternalLink href={ncbiGeneUrl(geneId)}>
          NCBI Gene {geneId}
        </ExternalLink>
        {' · '}
        <ExternalLink href={ensemblUrl(identity)}>Ensembl</ExternalLink>
        {uniprotAccession && (
          <>
            {' · '}
            <ExternalLink href={uniprotUrl(uniprotAccession)}>
              UniProt {uniprotAccession}
            </ExternalLink>
          </>
        )}
        {' · '}
        <ExternalLink href={ncbiTaxonomyUrl(refTaxId)}>taxonomy</ExternalLink>
      </p>
      {refRow && (
        <p className="orthologs-gene-meta">
          <span className="orthologs-loc">
            {refRow.chromosome}:{formatNumber(refRow.begin)}–
            {formatNumber(refRow.end)} ({refRow.strand > 0 ? '+' : '−'})
          </span>{' '}
          on {refRow.assembly.ucscDb ?? refRow.assembly.accession} ·{' '}
          <LaunchLink
            href={refRow.jbrowseUrl}
            title={`Open ${symbol} in JBrowse with the gene highlighted`}
          >
            Open in JBrowse
          </LaunchLink>
        </p>
      )}
      {aliases.length > 0 && (
        <p className="orthologs-gene-aliases">
          Also known as {aliases.join(', ')}
        </p>
      )}
    </div>
  )
}

// Into the deep tools, with the gene already resolved so neither asks for it
// again. The synteny card needs the reference row, which names the genome the
// launcher opens on.
function LaunchCards({
  identity,
  refResult,
}: {
  identity: GeneIdentity
  refResult: OrthologResult | undefined
}) {
  const { symbol, geneId, refTaxId } = identity
  const cards = [
    ...(features.proteinBrowser
      ? [
          {
            href: geneUrl('/protein-browser/', symbol, refTaxId),
            title: 'Protein browser',
            note: 'domain architecture, residue alignment and 3D structure in one connected session',
          },
        ]
      : []),
    ...(features.synteny && refResult
      ? [
          {
            href: syntenyLaunchUrl(refResult.assembly, geneId, symbol),
            title: 'Synteny',
            note: `a pairwise alignment view against ${refResult.assembly.ucscDb ?? refResult.assembly.accession}, centered on ${symbol}`,
          },
        ]
      : []),
  ]
  return cards.length > 0 ? (
    <section className="gene-section">
      <h2>Open in a tool</h2>
      <ul className="gene-launches">
        {cards.map(c => (
          <li key={c.href}>
            <a href={c.href}>{c.title} →</a> <span>{c.note}</span>
          </li>
        ))}
      </ul>
    </section>
  ) : null
}
