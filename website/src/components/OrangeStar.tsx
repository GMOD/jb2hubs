import { Star } from 'lucide-react'

import styles from './OrangeStar.module.css'
import tooltipStyles from './Tooltip.module.css'

export default function OrangeStar() {
  return (
    <span
      className={tooltipStyles.tooltip}
      data-tooltip="NCBI designated reference"
    >
      <Star
        fill="orange"
        strokeWidth={0}
        className={styles.orangeStar}
      />
    </span>
  )
}
