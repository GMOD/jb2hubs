import '../styles/ui.css'

import { useOrthologs } from '../hooks/useOrthologs.ts'
import { useTitlePrefix } from '../hooks/useTitlePrefix.ts'
import { useUrlState } from '../hooks/useUrlState.ts'
import GeneIdentityLine from './GeneIdentityLine.tsx'
import GeneQueryForm, { useGeneQuery } from './GeneQueryForm.tsx'
import OrthologHelp from './OrthologHelp.tsx'
import OrthologSection from './OrthologSection.tsx'
import { DEFAULT_SCOPE, scopeById } from './orthologClades.ts'

// /orthologs: every ortholog of a gene in the genomes we host, grouped by
// clade, on the same ?gene=&ref= as /gene plus scope= for the clade NCBI is
// asked about. /gene's preview links here.
export default function OrthologsPage() {
  const query = useGeneQuery()
  const { identity } = query
  const [scopeParam, setScopeParam] = useUrlState('scope', DEFAULT_SCOPE.id)
  const scope = scopeById(scopeParam)
  const { orthologs, refRow, refRowError, retryRefRow, drilldown } =
    useOrthologs(identity, scope)
  useTitlePrefix(identity?.symbol)

  return (
    <div>
      <p className="ui-lede">
        Every species we host a genome for that has an ortholog of the gene,
        grouped by clade, each one click from JBrowse.
      </p>
      <GeneQueryForm
        query={query}
        help={<OrthologHelp page="orthologs" />}
      />
      {identity && (
        <>
          <GeneIdentityLine identity={identity} />
          <OrthologSection
            identity={identity}
            scope={scope}
            mode={{
              view: 'all',
              onScope: id => {
                setScopeParam(id)
              },
            }}
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
