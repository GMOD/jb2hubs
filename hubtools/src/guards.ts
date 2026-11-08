export type Guard<T> = (v: unknown) => v is T

type Guarded<G> = G extends Guard<infer T> ? T : never

export function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null
}

export function isPlainRecord(v: unknown): v is Record<string, unknown> {
  return isRecord(v) && !Array.isArray(v)
}

export function isString(v: unknown) {
  return typeof v === 'string'
}

export function isNumber(v: unknown) {
  return typeof v === 'number'
}

export function isBoolean(v: unknown) {
  return typeof v === 'boolean'
}

export function isArray(v: unknown): v is unknown[] {
  return Array.isArray(v)
}

export function isArrayOf<T>(guard: Guard<T>) {
  return (v: unknown): v is T[] => Array.isArray(v) && v.every(guard)
}

export function isRecordOf<T>(guard: Guard<T>) {
  return (v: unknown): v is Record<string, T> =>
    isRecord(v) && !Array.isArray(v) && Object.values(v).every(guard)
}

export function isOptional<T>(guard: Guard<T>) {
  return (v: unknown): v is T | undefined => v === undefined || guard(v)
}

export function isNullable<T>(guard: Guard<T>) {
  return (v: unknown): v is T | null => v === null || guard(v)
}

export function isEither<A, B>(a: Guard<A>, b: Guard<B>) {
  return (v: unknown): v is A | B => a(v) || b(v)
}

export function isShape<S extends Record<string, Guard<unknown>>>(shape: S) {
  return (v: unknown): v is { [K in keyof S]: Guarded<S[K]> } =>
    isRecord(v) && Object.entries(shape).every(([k, guard]) => guard(v[k]))
}

export const isStringArray = isArrayOf(isString)

export function checked<T>(v: unknown, guard: Guard<T>, what: string) {
  if (!guard(v)) {
    throw new TypeError(`${what} does not have the expected shape`)
  }
  return v
}
