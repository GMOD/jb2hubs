import { VARIATION_LABELS } from './pangenomeLoci.ts'

import type { VariationClass } from './pangenomeLoci.ts'

export default function PangenomeVariationBadges({
  variation,
}: {
  variation: VariationClass[]
}) {
  return (
    <span>
      {variation.map(v => (
        <span
          key={v}
          className={`pg-badge pg-badge-${v}`}
        >
          {VARIATION_LABELS[v]}
        </span>
      ))}
    </span>
  )
}
