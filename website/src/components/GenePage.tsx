import '../styles/ui.css'

import { useState } from 'react'

import useSWRImmutable from 'swr/immutable'

import { features } from '../config/features.ts'
import { useUrlState } from '../hooks/useUrlState.ts'
import { ncbiGeneUrl, ncbiTaxonomyUrl } from '../lib/externalLinks.ts'
import { LIVE_QUERY } from '../lib/swr.ts'
import ErrorMessage from './ErrorMessage.tsx'
import HelpButton from './HelpButton.tsx'
import MultiSyntenyView from './MultiSyntenyView.tsx'
import OrthologHelpDialog from './OrthologHelpDialog.tsx'
import OrthologResultsTable from './OrthologResultsTable.tsx'
import {
  EXAMPLES,
  HUMAN_TAXON,
  choice,
  ensemblSearchUrl,
  fetchOrthologSet,
  localRef,
  resolveGeneIdentity,
  syntenyLaunchUrl,
  trimNeighborhood,
} from './geneHub.ts'
import { loadDrilldownData } from './multiSyntenyDrilldown.ts'
import { fetchTaxonAncestors } from './multiSyntenyTaxonTree.ts'
import {
  ANCHOR_CHOICES,
  DEFAULT_FLANK_BP,
  DEFAULT_MAX_ANCHORS,
  FLANK_CHOICES_BP,
} from './neighborhood.ts'
import { getNeighborhood } from './neighborhoodClient.ts'
import { DEFAULT_SCOPE, ORTHOLOG_SCOPES, scopeById } from './orthologClades.ts'
import { COMMON_SPECIES, geneUrl, refLabel } from './orthologSearchUtils.ts'
import { resolveRefTaxon } from './orthologSet.ts'

import type { GeneIdentity, OrthologSet } from './geneHub.ts'
import type { DrilldownData } from './multiSyntenyDrilldown.ts'
import type { OrthologScope } from './orthologClades.ts'
import type { OrthologResult } from './orthologSearchUtils.ts'
import type { FormEvent, ReactNode } from 'react'

function field(fd: FormData, name: string) {
  const v = fd.get(name)
  return typeof v === 'string' ? v.trim() : ''
}

// The URL is the query — ?gene=TP53&ref=9606, the contract every gene-first
// page shares, plus scope= for the table and anchors=/flank= for the figure.
// Submitting writes it (with the reference resolved to a taxon id first); the
// gene is resolved once off what it says, and every section is keyed on that
// one answer, so a view is shareable and back/forward work.
export default function GenePage() {
  const [geneParam, setGeneParam] = useUrlState('gene', '')
  const [refParam, setRefParam] = useUrlState('ref', String(HUMAN_TAXON))
  const [scopeParam, setScopeParam] = useUrlState('scope', DEFAULT_SCOPE.id)
  const [refError, setRefError] = useState<unknown>(undefined)
  const [helpOpen, setHelpOpen] = useState(false)

  const gene = geneParam.trim()
  const ref = localRef(refParam)
  const scope = scopeById(scopeParam)

  const {
    data: identity,
    error,
    isLoading,
  } = useSWRImmutable(
    gene ? ['gene', gene, ref] : null,
    ([, g, r]) => resolveGeneIdentity(g, r),
    LIVE_QUERY,
  )

  // The pair catalog and assembly index behind the table's synteny links and
  // the figure's drill-downs, fetched once there is a gene to show them for.
  const { data: drilldown } = useSWRImmutable(
    identity ? 'gene-drilldown' : null,
    loadDrilldownData,
  )

  const orthologs = useSWRImmutable(
    identity ? ['orthologs', identity.geneId, scope.id] : null,
    ([, geneId, scopeId]) => fetchOrthologSet(geneId, scopeById(scopeId)),
    LIVE_QUERY,
  )
  const refResult = orthologs.data?.results.find(
    r => r.assembly.taxonId === identity?.refTaxId,
  )

  function show(symbol: string, taxId: number) {
    setRefError(undefined)
    setGeneParam(symbol)
    setRefParam(String(taxId))
  }

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const fd = new FormData(e.currentTarget)
    const g = field(fd, 'gene')
    const refText = field(fd, 'ref')
    if (g && refText) {
      try {
        show(g, await resolveRefTaxon(refText))
      } catch (err) {
        setRefError(err)
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
              key={refParam}
              name="ref"
              className="ui-select"
              list="gene-ref-species"
              defaultValue={refLabel(refParam)}
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
            disabled={isLoading}
          >
            {isLoading ? 'Resolving…' : 'Search'}
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
      <ErrorMessage
        error={error}
        className="ui-error"
      />
      {isLoading && (
        <p className="ui-hint">
          Resolving {gene} in {refLabel(ref)}…
        </p>
      )}

      {identity && (
        <>
          <IdentityHeader identity={identity} />
          <OrthologSection
            identity={identity}
            scope={scope}
            onScope={id => {
              setScopeParam(id)
            }}
            orthologs={orthologs.data}
            error={orthologs.error}
            loading={orthologs.isLoading}
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
            refResult={refResult}
          />
        </>
      )}
    </div>
  )
}

function ExternalLink({
  href,
  children,
}: {
  href: string
  children: ReactNode
}) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
    >
      {children}
    </a>
  )
}

// What the gene actually is, from the summary the resolution already made. A
// symbol alone doesn't tell you whether you got the gene you meant; the
// description, the cytogenetic band and the alias list do.
function IdentityHeader({ identity }: { identity: GeneIdentity }) {
  const {
    symbol,
    description,
    species,
    commonName,
    mapLocation,
    geneId,
    refTaxId,
    aliases,
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
        <ExternalLink href={ensemblSearchUrl(symbol)}>Ensembl</ExternalLink>
        {' · '}
        <ExternalLink href={ncbiTaxonomyUrl(refTaxId)}>taxonomy</ExternalLink>
      </p>
      {aliases.length > 0 && (
        <p className="orthologs-gene-aliases">
          Also known as {aliases.join(', ')}
        </p>
      )}
    </div>
  )
}

function OrthologSection({
  identity,
  scope,
  onScope,
  orthologs,
  error,
  loading,
  refResult,
  drilldown,
}: {
  identity: GeneIdentity
  scope: OrthologScope
  onScope: (id: string) => void
  orthologs: OrthologSet | undefined
  error: unknown
  loading: boolean
  refResult: OrthologResult | undefined
  drilldown: DrilldownData | undefined
}) {
  const { symbol, geneId, refTaxId } = identity
  const results = orthologs?.results
  // Root-to-taxon lineages for the species in this answer, which is what lets
  // the table group its rows by clade. Fetched after the rows are on screen —
  // another second of NCBI, and a readable-but-ungrouped table beats a blank
  // one. A failure leaves `data` undefined and the table renders one flat
  // group; nothing the reader asked for is missing.
  const { data: lineages } = useSWRImmutable(
    results && results.length > 0 ? ['lineages', geneId, scope.id] : null,
    () => fetchTaxonAncestors((results ?? []).map(r => r.assembly.taxonId)),
    LIVE_QUERY,
  )
  const scoped = scope.taxa.length > 0

  return (
    <section className="gene-section">
      <div className="gene-section-head">
        <h2>Orthologs in hosted genomes</h2>
        <label className="gene-scope">
          Limit to{' '}
          <select
            className="ui-select"
            value={scope.id}
            onChange={e => {
              onScope(e.target.value)
            }}
            title="Ask NCBI for orthologs in one clade only — a smaller, faster answer than every species"
          >
            {ORTHOLOG_SCOPES.map(s => (
              <option
                key={s.id}
                value={s.id}
              >
                {s.label}
              </option>
            ))}
          </select>
        </label>
      </div>
      {loading && <p className="ui-hint">Fetching orthologs of {symbol}…</p>}
      <ErrorMessage
        error={error}
        className="ui-error"
      />
      {orthologs && results && (
        <>
          {orthologs.totalOrthologs > 0 && (
            <p className="orthologs-summary">
              {results.length} of {orthologs.totalOrthologs} NCBI ortholog
              {orthologs.totalOrthologs === 1 ? '' : 's'}
              {scoped ? ` in ${scope.label.toLowerCase()}` : ''} present in our
              collection
            </p>
          )}
          {results.length > 0 && !refResult && scoped && (
            <p className="orthologs-note">
              {identity.species || 'Your reference species'} is outside{' '}
              {scope.label.toLowerCase()}, so these rows have no reference row
              to mark and no synteny links — those compare each ortholog against
              the reference. Search every species to get them back.
            </p>
          )}
          {results.length === 0 ? (
            <p className="ui-hint">
              {orthologs.totalOrthologs > 0
                ? 'NCBI lists orthologs for this gene, but we host none of their genomes'
                : 'NCBI lists no orthologs for this gene'}
              {scoped ? ` within ${scope.label.toLowerCase()}` : ''}.
            </p>
          ) : (
            // Remounted per gene and scope, which is what drops the previous
            // answer's filter text and open clades.
            <OrthologResultsTable
              key={`${geneId}:${refTaxId}:${scope.id}`}
              results={results}
              refResult={refResult}
              pairIndex={drilldown?.index}
              lineages={lineages}
            />
          )}
        </>
      )}
    </section>
  )
}

function GeneOrderSection({
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
  const { symbol, refTaxId } = identity

  // Keyed on NCBI's spelling of the symbol rather than what was typed, so
  // `p53` and `TP53` share one cached neighborhood. keepPreviousData holds the
  // current figure on screen until the next one lands.
  const { data, error, isValidating } = useSWRImmutable(
    ['neighborhood', symbol, refTaxId, maxAnchors, flankBp],
    ([, g, r, a, f]) => getNeighborhood(g, r, { maxAnchors: a, flankBp: f }),
    { ...LIVE_QUERY, keepPreviousData: true, revalidateOnFocus: false },
  )
  const trimmed = data && !error ? trimNeighborhood(data) : undefined
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
      <ErrorMessage
        error={error}
        className="ui-error"
      />
      {nb?.species.length === 0 && !isValidating && (
        <p className="ui-hint">No informative ortholog neighborhoods found.</p>
      )}
      {nb && eligible > nb.species.length && (
        <p className="ui-hint">
          Showing the {nb.species.length} species nearest the reference of{' '}
          {eligible} with orthologs here.
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
            href: geneUrl('/protein-browser', symbol, refTaxId),
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
