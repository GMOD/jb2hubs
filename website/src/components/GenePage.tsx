import '../styles/ui.css'
import '../styles/gene.css'

import { useOrthologs } from '../hooks/useOrthologs.ts'
import { useTitlePrefix } from '../hooks/useTitlePrefix.ts'
import { ncbiGeneUrl } from '../lib/externalLinks.ts'
import { DesktopLaunchSwitch, LaunchLink } from './DesktopLaunch.tsx'
import ExternalLink from './ExternalLink.tsx'
import GeneQueryForm, { useGeneQuery } from './GeneQueryForm.tsx'
import OrthologHelp from './OrthologHelp.tsx'
import OrthologSection from './OrthologSection.tsx'
import { ensemblUrl, syntenyLaunchUrl, uniprotUrl } from './geneHub.ts'
import { DEFAULT_SCOPE } from './orthologClades.ts'
import { geneUrl, locusText } from './orthologSearchUtils.ts'

import type { GeneIdentity } from './geneHub.ts'
import type { OrthologResult } from './orthologSearchUtils.ts'

// The gene hub: the query form, what the gene is, and a preview of its
// orthologs. The full ortholog table and the deep views (gene order, protein
// browser, synteny) are launches, each its own page.
export default function GenePage() {
  const query = useGeneQuery()
  const { gene, identity } = query
  const { orthologs, refRow, refRowError, retryRefRow, drilldown } =
    useOrthologs(identity, DEFAULT_SCOPE)
  useTitlePrefix(identity?.symbol)

  return (
    <div>
      {!gene && (
        <p className="ui-lede">
          Look up a gene in a reference species and see it across every genome
          we host: its orthologs, each one click from JBrowse, and from there
          the order of its neighbouring genes, its protein and its synteny.
        </p>
      )}
      <GeneQueryForm
        query={query}
        help={<OrthologHelp page="gene" />}
      />

      {identity && (
        <>
          <IdentityHeader
            identity={identity}
            typed={gene}
            refRow={refRow}
          />
          <OrthologSection
            identity={identity}
            scope={DEFAULT_SCOPE}
            mode={{ view: 'preview' }}
            orthologs={orthologs.data}
            error={orthologs.error}
            loading={orthologs.isLoading}
            onRetry={() => {
              void orthologs.mutate()
            }}
            refResult={refRow}
            refError={refRowError}
            onRetryRef={retryRefRow}
            drilldown={drilldown}
          />
        </>
      )}
    </div>
  )
}

// What the gene actually is, from the report the resolution already made. A
// symbol alone doesn't tell you whether you got the gene you meant; the
// description and the cytogenetic band do. Once the ortholog rows land, the
// reference's own row puts the gene on the genome we host, one click from
// JBrowse.
function IdentityHeader({
  identity,
  typed,
  refRow,
}: {
  identity: GeneIdentity
  typed: string
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
  const matchedAlias =
    typed.toLowerCase() !== symbol.toLowerCase()
      ? aliases.find(a => a.toLowerCase() === typed.toLowerCase())
      : undefined
  return (
    <div className="gene-card">
      <h2 className="gene-card-title">
        {symbol}
        {description ? (
          <span className="gene-card-desc"> {description}</span>
        ) : null}
      </h2>
      {matchedAlias && (
        <p className="gene-card-meta">
          Matched {matchedAlias}, an alias of {symbol}
        </p>
      )}
      <dl className="gene-facts">
        <dt>Organism</dt>
        <dd>
          {species ? <em>{species}</em> : `taxon ${refTaxId}`}
          {commonName ? ` (${commonName})` : ''}
        </dd>
        {(mapLocation || refRow) && (
          <>
            <dt>Location</dt>
            <dd>
              {mapLocation}
              {mapLocation && refRow ? ' · ' : ''}
              {refRow && (
                <>
                  <span className="orthologs-loc">
                    {locusText(
                      refRow.chromosome,
                      refRow.begin,
                      refRow.end,
                      refRow.strand,
                    )}
                  </span>{' '}
                  on {refRow.assembly.ucscDb ?? refRow.assembly.accession}
                </>
              )}
            </dd>
          </>
        )}
        {aliases.length > 0 && (
          <>
            <dt>Also known as</dt>
            <dd>{aliases.join(', ')}</dd>
          </>
        )}
        <dt>See also</dt>
        <dd>
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
        </dd>
      </dl>
      <div className="gene-card-actions">
        {refRow && (
          <LaunchLink
            href={refRow.jbrowseUrl}
            className="ui-btn-secondary"
            title={`Open ${symbol} in JBrowse with the gene highlighted`}
          >
            Open in JBrowse
          </LaunchLink>
        )}
        <a
          href={geneUrl('/conserved-gene-order/', symbol, refTaxId)}
          className="ui-btn-secondary"
          title="The order of the neighbouring genes across the species tree"
        >
          Gene order
        </a>
        <a
          href={geneUrl('/protein-browser/', symbol, refTaxId)}
          className="ui-btn-secondary"
          title="Domain architecture, residue alignment and 3D structure in one connected session"
        >
          Protein browser
        </a>
        {refRow && (
          <a
            href={syntenyLaunchUrl(refRow.assembly, geneId, symbol)}
            className="ui-btn-secondary"
            title={`A pairwise alignment view against ${refRow.assembly.ucscDb ?? refRow.assembly.accession}, centered on ${symbol}`}
          >
            Synteny
          </a>
        )}
        <DesktopLaunchSwitch className="orthologs-toggle" />
      </div>
    </div>
  )
}
