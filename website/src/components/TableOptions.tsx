import { useId } from 'react'

import { filterCategories } from './DataTable/utils/filterCategories.ts'

interface TableOptionsProps {
  filterOption: string
  setFilterOption: (option: string) => void
  showAllColumns: boolean
  setShowAllColumns: (show: boolean) => void
  disabled?: boolean
}

export default function TableOptions({
  filterOption,
  setFilterOption,
  showAllColumns,
  setShowAllColumns,
  disabled = false,
}: TableOptionsProps) {
  // Radio groups are scoped by `name` across the whole document, so a literal
  // would fuse the two tables' filters if a page ever rendered both: picking
  // "RefSeq only" in one would clear the other's selection.
  const filterName = useId()
  const columnsName = useId()
  return (
    <div>
      <div>
        {Object.entries(filterCategories).map(([key, val]) => (
          <label
            key={key}
            style={{
              marginRight: 15,
            }}
          >
            <input
              type="radio"
              name={filterName}
              value={key}
              disabled={disabled}
              checked={filterOption === key}
              onChange={() => {
                setFilterOption(key)
              }}
            />
            {val}
          </label>
        ))}
      </div>
      <div>
        <label
          style={{
            marginRight: '15px',
          }}
        >
          <input
            type="radio"
            name={columnsName}
            checked={!showAllColumns}
            disabled={disabled}
            onChange={() => {
              setShowAllColumns(false)
            }}
          />
          Show essential columns
        </label>
        <label
          style={{
            marginRight: '15px',
          }}
        >
          <input
            type="radio"
            name={columnsName}
            checked={showAllColumns}
            disabled={disabled}
            onChange={() => {
              setShowAllColumns(true)
            }}
          />
          Show all columns
        </label>
      </div>
    </div>
  )
}
