// Prints JSON the way oxfmt/prettier prints a `.json` file at printWidth 80:
// objects one key per line, arrays on one line when every element is a scalar
// and the line fits, number arrays packed several per line, and a trailing
// newline. A config written this way is already in the shape `pnpm format`
// would leave it, so the format pass is a no-op over the generated tree and
// `git status` reads true mid-run.
//
// Only the constructs a JBrowse config uses are handled; anything JSON.stringify
// would drop (undefined, functions) is dropped the same way.

const WIDTH = 80
const INDENT = '  '

function isScalar(v: unknown) {
  return (
    v === null ||
    typeof v !== 'object' ||
    (Array.isArray(v) ? v.length === 0 : Object.keys(v).length === 0)
  )
}

function scalar(v: unknown) {
  return typeof v === 'object' && v !== null
    ? Array.isArray(v)
      ? '[]'
      : '{}'
    : JSON.stringify(v)
}

function flatArray(arr: unknown[]) {
  return `[${arr.map(scalar).join(', ')}]`
}

// prettier's isConciselyPrintedArray: an array of numbers is filled rather than
// one-per-line when it does not fit.
function fillNumbers(arr: number[], indent: string) {
  const lines: string[] = []
  let line = ''
  arr.forEach((n, i) => {
    const item = JSON.stringify(n)
    const comma = i < arr.length - 1 ? 1 : 0
    if (line === '') {
      line = item
    } else if (indent.length + line.length + 2 + item.length + comma <= WIDTH) {
      line += `, ${item}`
    } else {
      lines.push(`${line},`)
      line = item
    }
  })
  lines.push(line)
  return lines.map(l => indent + l).join('\n')
}

// prettier breaks an array whose elements are all arrays with more than one
// element each (or all objects with more than one key), regardless of width.
function forcedBreak(arr: unknown[]) {
  return (
    arr.length > 1 &&
    arr.every(
      e =>
        (Array.isArray(e) && e.length > 1) ||
        (!Array.isArray(e) &&
          typeof e === 'object' &&
          e !== null &&
          Object.keys(e).length > 1),
    )
  )
}

// `used` is what already sits on the line before the value, and `trail` what
// follows it on the same line when it stays flat (`,` or nothing).
function print(v: unknown, depth: number, used: number, trail: number): string {
  if (isScalar(v)) {
    return scalar(v)
  }
  const indent = INDENT.repeat(depth)
  const inner = INDENT.repeat(depth + 1)
  if (Array.isArray(v)) {
    const flat = flatArray(v)
    if (
      !forcedBreak(v) &&
      v.every(isScalar) &&
      used + flat.length + trail <= WIDTH
    ) {
      return flat
    }
    if (v.every((e): e is number => typeof e === 'number')) {
      return `[\n${fillNumbers(v, inner)}\n${indent}]`
    }
    const items = v.map(
      (e, i) =>
        inner + print(e, depth + 1, inner.length, i < v.length - 1 ? 1 : 0),
    )
    return `[\n${items.join(',\n')}\n${indent}]`
  }
  const entries = Object.entries(v as Record<string, unknown>).filter(
    ([, val]) => val !== undefined,
  )
  const items = entries.map(([k, val], i) => {
    const key = `${JSON.stringify(k)}: `
    const last = i === entries.length - 1
    return (
      inner +
      key +
      print(val, depth + 1, inner.length + key.length, last ? 0 : 1)
    )
  })
  return `{\n${items.join(',\n')}\n${indent}}`
}

export function formatJson(value: unknown) {
  return `${print(value, 0, 0, 0)}\n`
}
