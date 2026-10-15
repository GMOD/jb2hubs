import '../styles/ui.css'

import useSWRImmutable from 'swr/immutable'

import { useTitlePrefix } from '../hooks/useTitlePrefix.ts'
import GeneOrderSection from './GeneOrderSection.tsx'
import GeneQueryForm, { useGeneQuery } from './GeneQueryForm.tsx'
import {
  SINGLE_GENOME_DRILLDOWN,
  loadDrilldownData,
} from './multiSyntenyDrilldown.ts'
import { geneUrl } from './orthologSearchUtils.ts'

// /conserved-gene-order: one gene's neighbours drawn across the species tree,
// with the figure's options in view. The same ?gene=&ref= as /gene, which
// launches it from the gene card.
export default function GeneOrderPage() {
  const query = useGeneQuery()
  const { identity } = query

  // The pair catalog and assembly index behind the figure's drill-downs. A
  // failed catalog is an error SWR retries; meanwhile each gene links to its
  // own genome.
  const { data: loadedDrilldown, error: drilldownError } = useSWRImmutable(
    identity ? 'gene-drilldown' : null,
    loadDrilldownData,
  )
  const drilldown =
    loadedDrilldown ?? (drilldownError ? SINGLE_GENOME_DRILLDOWN : undefined)
  useTitlePrefix(identity?.symbol)

  return (
    <div>
      <p className="ui-lede">
        A gene and its neighbours in each species, rows in taxonomy order with
        the tree at left. Each color is one gene, and ribbons join it between
        rows, so a crossing is a rearrangement.
      </p>
      <GeneQueryForm query={query} />
      {identity && (
        <>
          <p className="msv-identity">
            <strong>{identity.symbol}</strong>
            {identity.description ? ` ${identity.description}` : ''}
            {identity.species ? (
              <>
                {' · '}
                <em>{identity.species}</em>
              </>
            ) : null}
            {' · '}
            <a href={geneUrl('/gene/', identity.symbol, identity.refTaxId)}>
              Orthologs and more
            </a>
          </p>
          <GeneOrderSection
            identity={identity}
            drilldown={drilldown}
          />
        </>
      )}
    </div>
  )
}
