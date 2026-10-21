import { Star } from 'lucide-react'

import tooltipStyles from './Tooltip.module.css'

export default function OrangeStar() {
  return (
    <span
      className={tooltipStyles.tooltip}
      data-tooltip="NCBI designated reference"
      role="img"
      aria-label="NCBI designated reference"
    >
      <Star
        fill="orange"
        strokeWidth={0}
        size="1em"
      />
    </span>
  )
}
