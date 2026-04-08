import { X } from 'lucide-react'

import styles from './RedX.module.css'
import tooltipStyles from './Tooltip.module.css'

export default function RedX() {
  return (
    <span
      className={tooltipStyles.tooltip}
      data-tooltip="NCBI RefSeq suppressed"
    >
      <X
        stroke="red"
        className={styles.redX}
      />
    </span>
  )
}
