import assert from 'node:assert'
import { test } from 'node:test'

import {
  GENE_FLANK_BP,
  formatRegion,
  matchRefName,
  parseRegion,
  resolveRegion,
} from './pangenomeRegion.ts'

test('a locstring is read the way a browser shows it, and comes back 0-based', () => {
  assert.deepEqual(parseRegion('chr1:196,740,001-196,850,000'), {
    chrom: 'chr1',
    start: 196_740_000,
    end: 196_850_000,
  })
  assert.deepEqual(parseRegion(' chr6 : 32510001 .. 32600000 '), {
    chrom: 'chr6',
    start: 32_510_000,
    end: 32_600_000,
  })
  assert.equal(
    formatRegion({ chrom: 'chr1', start: 196_740_000, end: 196_850_000 }),
    'chr1:196,740,001-196,850,000',
  )
})

test('a start at or before the first base clamps to it', () => {
  assert.deepEqual(parseRegion('chr1:0-1,000'), {
    chrom: 'chr1',
    start: 0,
    end: 1000,
  })
})

test('a chromosome is named the way the file names it, or not at all', () => {
  const known = ['chr1', 'chrX', 'chrM']
  assert.equal(matchRefName('chr1', known), 'chr1')
  assert.equal(matchRefName('1', known), 'chr1')
  assert.equal(matchRefName('x', known), 'chrX')
  assert.equal(matchRefName('MT', known), 'chrM')
  assert.equal(matchRefName('chr99', known), undefined)
})

test('what is not a region is left for a gene lookup', () => {
  assert.equal(parseRegion('CFH'), undefined)
  assert.equal(parseRegion('chr1:200-100'), undefined)
  assert.equal(parseRegion('chr1:100'), undefined)
})

test('a gene comes back as its span with flanks', async () => {
  const fetchImpl = (async () =>
    new Response(
      JSON.stringify({
        hits: [
          {
            symbol: 'CFH',
            genomic_pos: { chr: '1', start: 196_652_043, end: 196_747_504 },
          },
        ],
      }),
    )) as unknown as typeof fetch
  assert.deepEqual(await resolveRegion('CFH', 9606, { fetchImpl }), {
    chrom: 'chr1',
    start: 196_652_042 - GENE_FLANK_BP,
    end: 196_747_504 + GENE_FLANK_BP,
  })
})

test('a gene placed on no plain chromosome is no window', async () => {
  const fetchImpl = (async () =>
    new Response(
      JSON.stringify({
        hits: [
          { symbol: 'X', genomic_pos: { chr: 'KI270713.1', start: 1, end: 2 } },
        ],
      }),
    )) as unknown as typeof fetch
  assert.equal(await resolveRegion('X', 9606, { fetchImpl }), undefined)
})

// Answers keyed by the query mygene is sent, and a record of every query asked.
function mygene(answers: Record<string, Response>) {
  const asked: string[] = []
  const fetchImpl = (async (url: string) => {
    const q = new URL(url).searchParams.get('q') ?? ''
    asked.push(q)
    return answers[q] ?? new Response(JSON.stringify({ hits: [] }))
  }) as unknown as typeof fetch
  return { asked, fetchImpl }
}

const erbb2 = () =>
  new Response(
    JSON.stringify({
      hits: [
        {
          symbol: 'ERBB2',
          genomic_pos: { chr: '17', start: 39_687_914, end: 39_730_426 },
        },
      ],
    }),
  )

// Unquoted, the table's own `C4A / C4B` was a query syntax error, HTTP 400.
test('a symbol is sent as one quoted term, and a 4xx means not found', async () => {
  const { asked, fetchImpl } = mygene({
    'symbol:"C4A / C4B"': new Response('{"code":400}', { status: 400 }),
  })
  assert.equal(await resolveRegion('C4A / C4B', 9606, { fetchImpl }), undefined)
  assert.deepEqual(asked, ['symbol:"C4A / C4B"', 'alias:"C4A / C4B"'])
})

test('a quote or backslash stays inside the term', async () => {
  const { asked, fetchImpl } = mygene({})
  await resolveRegion('a"b\\', 9606, { fetchImpl })
  assert.equal(asked[0], 'symbol:"a\\"b\\\\"')
})

test('text that is no symbol is tried as an alias', async () => {
  const { asked, fetchImpl } = mygene({ 'alias:"HER2"': erbb2() })
  assert.deepEqual(await resolveRegion('HER2', 9606, { fetchImpl }), {
    chrom: 'chr17',
    start: 39_687_913 - GENE_FLANK_BP,
    end: 39_730_426 + GENE_FLANK_BP,
  })
  assert.deepEqual(asked, ['symbol:"HER2"', 'alias:"HER2"'])
})

test('a symbol that matches is not looked up as an alias', async () => {
  const { asked, fetchImpl } = mygene({ 'symbol:"ERBB2"': erbb2() })
  assert.ok(await resolveRegion('ERBB2', 9606, { fetchImpl }))
  assert.deepEqual(asked, ['symbol:"ERBB2"'])
})

test('a server error is an error, not a gene that does not exist', async () => {
  const { fetchImpl } = mygene({
    'symbol:"CFH"': new Response('', { status: 503 }),
  })
  await assert.rejects(resolveRegion('CFH', 9606, { fetchImpl }), /HTTP 503/)
})

test('the lookup carries the deadline it is given', async () => {
  const signal = AbortSignal.timeout(60_000)
  const seen: (AbortSignal | null | undefined)[] = []
  const fetchImpl = (async (_url: string, init?: RequestInit) => {
    seen.push(init?.signal)
    return new Response(JSON.stringify({ hits: [] }))
  }) as unknown as typeof fetch
  await resolveRegion('CFH', 9606, { fetchImpl, signal })
  assert.deepEqual(seen, [signal, signal])
})
