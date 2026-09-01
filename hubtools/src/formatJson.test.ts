import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { formatJson } from './formatJson.ts'

describe('formatJson', () => {
  it('collapses a scalar array that fits and expands an object', () => {
    assert.equal(
      formatJson({ category: ['Genes'], assemblyNames: ['GCF_1'], n: 1 }),
      `{
  "category": ["Genes"],
  "assemblyNames": ["GCF_1"],
  "n": 1
}
`,
    )
  })

  it('counts the indent, the key and the trailing comma toward the width', () => {
    // 6 spaces + `"k": ` + 66 chars of array + `,` = 78; adding two more
    // characters to the string pushes the comma past 80.
    const fits = 'x'.repeat(62)
    const spills = 'x'.repeat(64)
    const out = formatJson({ a: { b: { k: [fits], k2: [spills], last: 1 } } })
    assert.match(out, /"k": \["x{62}"\],\n/)
    assert.match(out, /"k2": \[\n\s+"x{64}"\n\s+\],\n/)
  })

  it('lets the last property use the comma column', () => {
    const s = 'x'.repeat(63)
    const out = formatJson({ a: { b: { k: [s] } } })
    assert.match(out, /"k": \["x{63}"\]\n/)
  })

  it('always breaks an array holding a non-empty object', () => {
    assert.equal(
      formatJson({ a: [{ b: 1 }] }),
      `{
  "a": [
    {
      "b": 1
    }
  ]
}
`,
    )
  })

  it('prints empty containers inline and breaks arrays of multi-element arrays', () => {
    assert.equal(
      formatJson({ a: [], b: {}, c: [[], {}] }),
      `{
  "a": [],
  "b": {},
  "c": [[], {}]
}
`,
    )
    assert.equal(
      formatJson([
        [1, 2],
        [3, 4],
      ]),
      `[
  [1, 2],
  [3, 4]
]
`,
    )
  })

  it('fills a long number array several per line', () => {
    const out = formatJson({
      n: Array.from({ length: 40 }, (_, i) => i * 1000),
    })
    const lines = out.split('\n')
    assert.equal(lines[1], '  "n": [')
    assert.ok(lines[2]!.startsWith('    0, 1000, 2000'))
    assert.ok(lines.every(l => l.length <= 80))
  })

  it('drops undefined like JSON.stringify and escapes strings the same way', () => {
    assert.equal(
      formatJson({ a: undefined, b: 'q"\n ' }),
      `{
  "b": ${JSON.stringify('q"\n ')}
}
`,
    )
  })
})
