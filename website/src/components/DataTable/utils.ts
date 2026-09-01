export function notEmpty<TValue>(
  value: TValue | null | undefined,
): value is TValue {
  return value !== null && value !== undefined
}

export const statusOrder: Record<string, number> = {
  'complete genome': 1,
  chromosome: 2,
  scaffold: 3,
  contig: 4,
}

// Strings compare the way a reader expects a table column to: case-insensitive
// and with digit runs as numbers ("chr2" before "chr10"). Numbers compare as
// numbers. A mixed pair falls back to the string comparison of both.
const collator = new Intl.Collator('en', { numeric: true, sensitivity: 'base' })

export function makeComparator<T>(
  getValue: (row: T) => string | number,
  desc: boolean,
) {
  return (a: T, b: T) => {
    const aVal = getValue(a)
    const bVal = getValue(b)
    const order =
      typeof aVal === 'number' && typeof bVal === 'number'
        ? aVal - bVal
        : collator.compare(String(aVal), String(bVal))
    return desc ? -order : order
  }
}
