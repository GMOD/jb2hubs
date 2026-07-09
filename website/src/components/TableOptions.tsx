import React from 'react'

import { filterCategories } from './DataTable/utils/filterCategories.ts'

interface TableOptionsProps {
  filterOption: string
  setFilterOption: (option: string) => void
  showAllColumns: boolean
  setShowAllColumns: (show: boolean) => void
}

export default function TableOptions({
  filterOption,
  setFilterOption,
  showAllColumns,
  setShowAllColumns,
}: TableOptionsProps) {
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
              name="databaseFilter"
              value={key}
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
            name="columnVisibility"
            checked={!showAllColumns}
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
            name="columnVisibility"
            checked={showAllColumns}
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
