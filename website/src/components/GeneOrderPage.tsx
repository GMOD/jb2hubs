import '../styles/ui.css'

import { useDrilldown } from '../hooks/useDrilldown.ts'
import { useTitlePrefix } from '../hooks/useTitlePrefix.ts'
import GeneIdentityLine from './GeneIdentityLine.tsx'
import GeneOrderSection from './GeneOrderSection.tsx'
import GeneQueryForm, { useGeneQuery } from './GeneQueryForm.tsx'

// /conserved-gene-order: one gene's neighbors drawn across the species tree,
// with the figure's options in view. The same ?gene=&ref= as /gene, which
// launches it from the gene card.
export default function GeneOrderPage() {
  const query = useGeneQuery()
  const { identity } = query
  const drilldown = useDrilldown(identity !== undefined)
  useTitlePrefix(identity?.symbol)

  return (
    <div>
      <p className="ui-lede">
        A gene and its nearest protein-coding neighbors, drawn in each species
        in the reference’s order. Gene positions and ortholog calls are NCBI’s.
      </p>
      <GeneQueryForm query={query} />
      {identity && (
        <>
          <GeneIdentityLine identity={identity} />
          <GeneOrderSection
            key={`${identity.geneId}|${identity.refTaxId}`}
            identity={identity}
            drilldown={drilldown}
          />
        </>
      )}
    </div>
  )
}
