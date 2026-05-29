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

export function makeComparator<T>(
  getValue: (row: T) => string | number,
  desc: boolean,
) {
  return (a: T, b: T) => {
    const aVal = getValue(a)
    const bVal = getValue(b)
    if (aVal < bVal) {
      return desc ? 1 : -1
    }
    if (aVal > bVal) {
      return desc ? -1 : 1
    }
    return 0
  }
}
