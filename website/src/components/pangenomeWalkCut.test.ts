import assert from 'node:assert'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'

import { TabixIndexedFile } from '@gmod/tabix'
import { WalkReader } from '@jbrowse/graph-walks'
import { LocalFile } from 'generic-filehandle2'

import { abridgedWalks, cutWalks } from './pangenomeWalkCut.ts'

import type { GraphTables } from '@jbrowse/graph-walks'

// gfa-to-tabix 1.4.0 (walk format 5) `--walks --refs GRCh38` over its
// docs/figures/walks.gfa:
// GRCh38 >1>2>3>4, HG002#1 takes a 15 bp insertion (node 5) in place of node
// 3, HG002#2 is the reference, and CHM13 deletes node 3.
const readerOf = (file: string) => () => {
  const fixture = fileURLToPath(new URL(`fixtures/${file}`, import.meta.url))
  return new WalkReader(
    new TabixIndexedFile({
      filehandle: new LocalFile(fixture),
      tbiFilehandle: new LocalFile(`${fixture}.tbi`),
    }),
  )
}
const reader = readerOf('bubble.GRCh38.walks.bed.gz')

// ggbandage's pggb E. coli walk files on K12, as gfa-to-tabix 1.4.0 writes
// them with and without `--abridge-steps 20`, which abridges IAI39 and Sakai
const ecoli = readerOf('ecoli_pggb.K12.walks.bed.gz')
const ecoliAbridged = readerOf('ecoli_pggb_abridged.K12.walks.bed.gz')
const ecoliWindow = { chrom: 'chr', start: 1_004_500, end: 1_004_961 }

const walkSteps = ({ nodes, walks }: GraphTables) =>
  Object.fromEntries(
    walks.names.map((n, p) => [
      n,
      Array.from(
        walks.steps.slice(walks.offsets[p], walks.offsets[p + 1]),
        (s, i) =>
          `${walks.reversed[walks.offsets[p]! + i] ? '<' : '>'}${nodes.names[s]}`,
      ).join(''),
    ]),
  )

test('a cut holds every walk through the window, with its nodes and links', async () => {
  const tables = await cutWalks(reader(), {
    chrom: 'chr1',
    start: 15,
    end: 25,
  })
  const { nodes, links } = tables
  const name = (i: number) => nodes.names[i]
  const lengths = Object.fromEntries(
    nodes.names.map((n, i) => [n, nodes.lengths[i]]),
  )
  assert.deepEqual(lengths, { 1: 10, 2: 10, 3: 10, 4: 10, 5: 15 })

  assert.deepEqual(walkSteps(tables), {
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

test('an abridged walk cuts to its two reference nodes and its counts', async () => {
  const tables = await cutWalks(ecoliAbridged(), ecoliWindow)
  assert.deepEqual(
    abridgedWalks(tables).map(w => w.haplotype),
    ['IAI39#1', 'Sakai#1'],
  )
  for (const w of abridgedWalks(tables)) {
    assert.ok(w.steps > 20 && w.bp > 0)
  }
  const steps = walkSteps(tables)
  assert.equal(steps['IAI39#1#chr']!.split(/[<>]/).length - 1, 2)
})

test('an expanded walk cuts as from a file that did not abridge it', async () => {
  const expanded = await cutWalks(ecoliAbridged(), ecoliWindow, [
    'IAI39#1',
    'Sakai#1',
  ])
  const full = await cutWalks(ecoli(), ecoliWindow)
  assert.deepEqual(abridgedWalks(expanded), [])
  assert.deepEqual(walkSteps(expanded), walkSteps(full))
})

test('expanding one haplotype leaves the other abridged', async () => {
  const tables = await cutWalks(ecoliAbridged(), ecoliWindow, ['Sakai#1'])
  assert.deepEqual(
    abridgedWalks(tables).map(w => w.haplotype),
    ['IAI39#1'],
  )
  const full = walkSteps(await cutWalks(ecoli(), ecoliWindow))
  assert.equal(walkSteps(tables)['Sakai#1#chr'], full['Sakai#1#chr'])
})
