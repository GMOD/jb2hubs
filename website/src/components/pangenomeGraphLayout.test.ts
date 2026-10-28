import assert from 'node:assert'
import { test } from 'node:test'

import {
  Superseded,
  errorOf,
  layoutClient,
  replyError,
} from './pangenomeGraphLayout.ts'

import type {
  GraphReply,
  GraphRequest,
  LayoutWorker,
} from './pangenomeGraphLayout.ts'

class FakeWorker implements LayoutWorker {
  requests: GraphRequest[] = []
  terminated = false
  onmessage: LayoutWorker['onmessage'] = null
  onerror: LayoutWorker['onerror'] = null
  postMessage(request: GraphRequest) {
    this.requests.push(request)
  }
  terminate() {
    this.terminated = true
  }
  reply(data: GraphReply) {
    this.onmessage?.(new MessageEvent('message', { data }))
  }
}

function client() {
  const workers: FakeWorker[] = []
  const draw = layoutClient(() => {
    const w = new FakeWorker()
    workers.push(w)
    return w
  })
  return { workers, draw }
}

const lpa = { chrom: 'chr6', start: 160_612_935, end: 160_649_819 }
const amy1 = { chrom: 'chr1', start: 103_619_117, end: 103_623_197 }
const live = () => new AbortController().signal
const req = (region: typeof lpa, haplotype?: string) => ({
  walksUrl: 'w',
  region,
  haplotype,
  expand: [],
})
const drawn = (image: string) => ({ image, abridged: [] })

test('a reply resolves the request it answers', async () => {
  const { workers, draw } = client()
  const a = draw(req(lpa, 'HG00140#1'), live())
  const b = draw(req(lpa, 'HG00097#2'), live())
  const [w] = workers
  assert.equal(workers.length, 1)
  assert.deepEqual(
    w!.requests.map(r => r.haplotype),
    ['HG00140#1', 'HG00097#2'],
  )
  w!.reply({ id: w!.requests[1]!.id, ...drawn('b') })
  w!.reply({ id: w!.requests[0]!.id, ...drawn('a') })
  assert.deepEqual(await Promise.all([a, b]), [drawn('a'), drawn('b')])
  assert.equal(w!.terminated, false)
})

test('a request names the walks to read in full, and its reply those left abridged', async () => {
  const { workers, draw } = client()
  const a = draw({ ...req(lpa, 'HG00140#1'), expand: ['HG00133#1'] }, live())
  const [w] = workers
  assert.deepEqual(w!.requests[0]!.expand, ['HG00133#1'])
  const abridged = [{ haplotype: 'HG00097#1', steps: 140_000, bp: 2_100_000 }]
  w!.reply({ id: w!.requests[0]!.id, image: 'a', abridged })
  assert.deepEqual(await a, { image: 'a', abridged })
})

test('an idle worker serves the next window', async () => {
  const { workers, draw } = client()
  const a = draw(req(lpa), live())
  workers[0]!.reply({ id: workers[0]!.requests[0]!.id, ...drawn('a') })
  await a
  const b = draw(req(amy1), live())
  assert.equal(workers.length, 1)
  workers[0]!.reply({ id: workers[0]!.requests[1]!.id, ...drawn('b') })
  assert.deepEqual(await b, drawn('b'))
})

test('another window terminates a busy worker and rejects what it owed', async () => {
  const { workers, draw } = client()
  const a = draw(req(lpa), live())
  const b = draw(req(amy1), live())
  await assert.rejects(a, Superseded)
  assert.equal(workers[0]!.terminated, true)
  assert.equal(workers.length, 2)
  workers[1]!.reply({ id: workers[1]!.requests[0]!.id, ...drawn('b') })
  assert.deepEqual(await b, drawn('b'))
})

test('an abort terminates the worker with the signal reason', async () => {
  const { workers, draw } = client()
  const abort = new AbortController()
  const a = draw(req(lpa), abort.signal)
  abort.abort(new DOMException('slow', 'TimeoutError'))
  await assert.rejects(a, { name: 'TimeoutError' })
  assert.equal(workers[0]!.terminated, true)
})

test('an abort reposts the requests still owed to a fresh worker', async () => {
  const { workers, draw } = client()
  const abort = new AbortController()
  const a = draw(req(lpa, 'HG00140#1'), abort.signal)
  const b = draw(req(lpa, 'HG00097#2'), live())
  abort.abort(new DOMException('slow', 'TimeoutError'))
  await assert.rejects(a, { name: 'TimeoutError' })
  assert.equal(workers[0]!.terminated, true)
  assert.deepEqual(
    workers[1]!.requests.map(r => r.haplotype),
    ['HG00097#2'],
  )
  workers[0]!.reply({ id: workers[0]!.requests[0]!.id, ...drawn('a') })
  workers[1]!.reply({ id: workers[1]!.requests[0]!.id, ...drawn('b') })
  assert.deepEqual(await b, drawn('b'))
})

test('an abort after the reply leaves the worker running', async () => {
  const { workers, draw } = client()
  const abort = new AbortController()
  const a = draw(req(lpa), abort.signal)
  workers[0]!.reply({ id: workers[0]!.requests[0]!.id, ...drawn('a') })
  assert.deepEqual(await a, drawn('a'))
  abort.abort()
  assert.equal(workers[0]!.terminated, false)
})

test('an aborted signal posts nothing', async () => {
  const { workers, draw } = client()
  await assert.rejects(
    draw(req(lpa), AbortSignal.abort()),
    /AbortError|aborted/,
  )
  assert.equal(workers.length, 0)
})

test('a failed worker rejects what it owed and the next request starts another', async () => {
  const { workers, draw } = client()
  const a = draw(req(lpa), live())
  workers[0]!.onerror?.({ message: 'boom' } as ErrorEvent)
  await assert.rejects(a, /boom/)
  assert.equal(workers[0]!.terminated, true)
  void draw(req(lpa), live())
  assert.equal(workers.length, 2)
})

test('a region too large to cut survives the trip back', async () => {
  const tooLarge = Object.assign(new Error('Zoom in'), {
    name: 'NodeLimitError',
    regionTooLarge: true,
  })
  const { workers, draw } = client()
  const a = draw(req(lpa), live())
  workers[0]!.reply({
    id: workers[0]!.requests[0]!.id,
    error: structuredClone(replyError(tooLarge)),
  })
  const error = await a.catch((e: unknown) => e)
  assert.ok(error instanceof Error && 'regionTooLarge' in error)
  assert.equal(error.name, 'NodeLimitError')
  assert.equal(error.message, 'Zoom in')
})

test('any other error comes back without regionTooLarge', () => {
  assert.equal('regionTooLarge' in errorOf(replyError(new Error('x'))), false)
  assert.deepEqual(replyError('x'), {
    name: 'Error',
    message: 'x',
    regionTooLarge: false,
  })
})
