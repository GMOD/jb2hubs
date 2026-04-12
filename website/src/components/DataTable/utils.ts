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

// List accepted sort direction values
export const sortOrder: ('asc' | 'desc' | '')[] = ['asc', 'desc', '']
