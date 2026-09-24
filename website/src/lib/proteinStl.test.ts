import assert from 'node:assert'
import { test } from 'node:test'

import { backboneTubeStl, parseCaTrace } from './proteinStl.ts'

type Vec3 = [number, number, number]

// The triangles back out of binary STL: an 84-byte header, then per triangle
// a normal and three vertices as little-endian float32, and two spare bytes.
function readTriangles(bytes: Uint8Array<ArrayBuffer>) {
  const view = new DataView(bytes.buffer)
  const vec = (offset: number): Vec3 => [
    view.getFloat32(offset, true),
    view.getFloat32(offset + 4, true),
    view.getFloat32(offset + 8, true),
  ]
  return Array.from({ length: view.getUint32(80, true) }, (_t, i) => {
    const offset = 84 + 50 * i
    return {
      normal: vec(offset),
      vertices: [vec(offset + 12), vec(offset + 24), vec(offset + 36)] as const,
    }
  })
}

// Summed over a closed mesh, each triangle's signed tetrahedron against the
// origin is the enclosed volume: positive when every face is wound
// counter-clockwise seen from outside, negative when the faces point in.
function signedVolume(triangles: ReturnType<typeof readTriangles>) {
  return triangles.reduce((sum, { vertices: [a, b, c] }) => {
    const det =
      a[0] * (b[1] * c[2] - b[2] * c[1]) -
      a[1] * (b[0] * c[2] - b[2] * c[0]) +
      a[2] * (b[0] * c[1] - b[1] * c[0])
    return sum + det / 6
  }, 0)
}

const straight: Vec3[] = Array.from({ length: 20 }, (_p, i) => [i * 3.8, 0, 0])

test('backboneTubeStl: a straight trace is a closed prism with every face outward', () => {
  const triangles = readTriangles(backboneTubeStl(straight))
  const segments = 12
  const walls = 19 * segments * 2
  assert.equal(triangles.length, walls + 2 * segments)
  // the trace runs along x, so a wall's outward direction is its y-z offset
  for (const { normal, vertices } of triangles.slice(0, walls)) {
    const y = vertices.reduce((s, v) => s + v[1], 0)
    const z = vertices.reduce((s, v) => s + v[2], 0)
    assert.ok(normal[1] * y + normal[2] * z > 0, 'a wall faces the backbone')
  }
  // a 12-gon of circumradius 2.5 swept 19 × 3.8 Å
  const area = 0.5 * segments * 2.5 ** 2 * Math.sin((2 * Math.PI) / segments)
  assert.ok(Math.abs(signedVolume(triangles) - area * 19 * 3.8) < 1)
})

test('parseCaTrace: alpha carbons of the first model, first altLoc only', () => {
  const atom = (name: string, altLoc: string, x: number) =>
    `ATOM      1  ${name.padEnd(3)}${altLoc}ALA A   1    ${x.toFixed(3).padStart(8)}   0.000   0.000  1.00  0.00           C`
  const pdb = [
    atom('N', ' ', 9),
    atom('CA', ' ', 1),
    atom('CA', 'A', 2),
    atom('CA', 'B', 99),
    'ENDMDL',
    atom('CA', ' ', 3),
  ].join('\n')
  assert.deepEqual(parseCaTrace(pdb), [
    [1, 0, 0],
    [2, 0, 0],
  ])
})
