import '../styles/ui.css'

import { useDrilldown } from '../hooks/useDrilldown.ts'
import { useTitlePrefix } from '../hooks/useTitlePrefix.ts'
import GeneIdentityLine from './GeneIdentityLine.tsx'
import GeneOrderSection from './GeneOrderSection.tsx'
import GeneQueryForm, { useGeneQuery } from './GeneQueryForm.tsx'

// /conserved-gene-order: one gene's neighbours drawn across the species tree,
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
        A gene and its neighbours in each species, rows in taxonomy order with
        the tree at left. Each color is one gene, and ribbons join it between
        rows, so a crossing is a rearrangement.
      </p>
      <GeneQueryForm query={query} />
      {identity && (
        <>
          <GeneIdentityLine identity={identity} />
          <GeneOrderSection
            identity={identity}
            drilldown={drilldown}
          />
        </>
      )}
    </div>
  )
}
