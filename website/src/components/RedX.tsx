import { X } from 'lucide-react'

import tooltipStyles from './Tooltip.module.css'

export default function RedX() {
  return (
    <span
      className={tooltipStyles.tooltip}
      data-tooltip="NCBI RefSeq suppressed"
      role="img"
      aria-label="NCBI RefSeq suppressed"
    >
      <X
        stroke="red"
        size="1em"
      />
    </span>
  )
}
