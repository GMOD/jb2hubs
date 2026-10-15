import '../styles/ui.css'

import { geneUrl } from './orthologSearchUtils.ts'

import type { GeneIdentity } from './geneHub.ts'

// The resolved gene above a tool's answer, with the way back to its /gene card.
export default function GeneIdentityLine({
  identity,
}: {
  identity: GeneIdentity
}) {
  const { symbol, description, species, refTaxId } = identity
  return (
    <p className="ui-gene-line">
      <strong>{symbol}</strong>
      {description ? ` ${description}` : ''}
      {species ? (
        <>
          {' · '}
          <em>{species}</em>
        </>
      ) : null}
      {' · '}
      <a href={geneUrl('/gene/', symbol, refTaxId)}>Gene card</a>
    </p>
  )
}
