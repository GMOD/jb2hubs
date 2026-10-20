import assert from 'node:assert'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'

import { TabixIndexedFile } from '@gmod/tabix'
import { WalkReader } from '@jbrowse/graph-walks'
import { LocalFile } from 'generic-filehandle2'

import { cutWalks } from './pangenomeWalkCut.ts'

// gfa-to-tabix 1.2.0 `--walks --refs GRCh38` over its docs/figures/walks.gfa:
// GRCh38 >1>2>3>4, HG002#1 takes a 15 bp insertion (node 5) in place of node
// 3, HG002#2 is the reference, and CHM13 deletes node 3.
const fixture = fileURLToPath(
  new URL('fixtures/bubble.GRCh38.walks.bed.gz', import.meta.url),
)
const reader = () =>
  new WalkReader(
    new TabixIndexedFile({
      filehandle: new LocalFile(fixture),
      tbiFilehandle: new LocalFile(`${fixture}.tbi`),
    }),
  )

test('a cut holds every walk through the window, with its nodes and links', async () => {
  const { nodes, links, walks } = await cutWalks(reader(), {
    chrom: 'chr1',
    start: 15,
    end: 25,
  })
  const name = (i: number) => nodes.names[i]
  const lengths = Object.fromEntries(
    nodes.names.map((n, i) => [n, nodes.lengths[i]]),
  )
  assert.deepEqual(lengths, { 1: 10, 2: 10, 3: 10, 4: 10, 5: 15 })

  const pathOf = (p: number) =>
    Array.from(
      walks.steps.slice(walks.offsets[p], walks.offsets[p + 1]),
      (s, i) =>
        `${walks.reversed[walks.offsets[p]! + i] ? '<' : '>'}${name(s)}`,
    ).join('')
  const paths = Object.fromEntries(walks.names.map((n, p) => [n, pathOf(p)]))
  assert.deepEqual(paths, {
    'GRCh38#0#chr1': '>1>2>3>4',
    'CHM13#0#chr1': '>1>2>4',
    'HG002#1#chr1': '>1>2>5>4',
    'HG002#2#chr1': '>1>2>3>4',
  })

  // `<4<5` is the link `>5>4` read from its other end.
  const edges = Array.from(links.from, (f, i) => {
    const [from, to] = [name(f), name(links.to[i]!)]
    const strands = links.strands[i]
    return strands === 0
      ? `${from}>${to}`
      : strands === 3
        ? `${to}>${from}`
        : ''
  }).sort()
  assert.deepEqual(edges, ['1>2', '2>3', '2>4', '2>5', '3>4', '5>4'])
})

test('a contig the walk file lacks is an error, not an empty graph', async () => {
  await assert.rejects(
    cutWalks(reader(), { chrom: 'chr2', start: 0, end: 10 }),
    /The walk file has no sequence chr2 on GRCh38; it holds GRCh38#0#chr1/,
  )
})
