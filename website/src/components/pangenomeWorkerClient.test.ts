import assert from 'node:assert'
import { test } from 'node:test'

import { layoutClient } from './pangenomeGraphLayout.ts'
import { structuralForms } from './pangenomeSvStates.ts'
import { walkFormsClient } from './pangenomeWalkFormsClient.ts'
import { Superseded, errorOf, replyError } from './pangenomeWorkerClient.ts'

import type { Drawn, GraphRequest } from './pangenomeGraphLayout.ts'
import type { StructuralFormsResult } from './pangenomeSvStates.ts'
import type { WalkFormsRequest } from './pangenomeWalkFormsClient.ts'
import type { PangenomeWorker, Posted, Reply } from './pangenomeWorkerClient.ts'

class FakeWorker<Request, Result> implements PangenomeWorker<Request, Result> {
  requests: Posted<Request>[] = []
  terminated = false
  onmessage: PangenomeWorker<Request, Result>['onmessage'] = null
  onerror: PangenomeWorker<Request, Result>['onerror'] = null
  postMessage(request: Posted<Request>) {
    this.requests.push(request)
  }
  terminate() {
    this.terminated = true
  }
  reply(data: Reply<Result>) {
    this.onmessage?.(new MessageEvent('message', { data }))
  }
}

function fakes<Request, Result>() {
  const workers: FakeWorker<Request, Result>[] = []
  const spawn = () => {
    const w = new FakeWorker<Request, Result>()
    workers.push(w)
    return w
  }
  return { workers, spawn }
}

function layout() {
  const { workers, spawn } = fakes<GraphRequest, Drawn>()
  return { workers, draw: layoutClient(spawn) }
}

function walkFormsOf(deadlineMs?: number) {
  const { workers, spawn } = fakes<WalkFormsRequest, StructuralFormsResult>()
  return { workers, ask: walkFormsClient(spawn, deadlineMs) }
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
  const { workers, draw } = layout()
  const a = draw(req(lpa, 'HG00140#1'), live())
  const b = draw(req(lpa, 'HG00097#2'), live())
  const [w] = workers
  assert.equal(workers.length, 1)
  assert.deepEqual(
    w!.requests.map(r => r.haplotype),
    ['HG00140#1', 'HG00097#2'],
  )
  w!.reply({ id: w!.requests[1]!.id, result: drawn('b') })
  w!.reply({ id: w!.requests[0]!.id, result: drawn('a') })
  assert.deepEqual(await Promise.all([a, b]), [drawn('a'), drawn('b')])
  assert.equal(w!.terminated, false)
})

test('a request names the walks to read in full, and its reply those left abridged', async () => {
  const { workers, draw } = layout()
  const a = draw({ ...req(lpa, 'HG00140#1'), expand: ['HG00133#1'] }, live())
  const [w] = workers
  assert.deepEqual(w!.requests[0]!.expand, ['HG00133#1'])
  const abridged = [{ haplotype: 'HG00097#1', steps: 140_000, bp: 2_100_000 }]
  w!.reply({ id: w!.requests[0]!.id, result: { image: 'a', abridged } })
  assert.deepEqual(await a, { image: 'a', abridged })
})

test('an idle worker serves the next window', async () => {
  const { workers, draw } = layout()
  const a = draw(req(lpa), live())
  workers[0]!.reply({ id: workers[0]!.requests[0]!.id, result: drawn('a') })
  await a
  const b = draw(req(amy1), live())
  assert.equal(workers.length, 1)
  workers[0]!.reply({ id: workers[0]!.requests[1]!.id, result: drawn('b') })
  assert.deepEqual(await b, drawn('b'))
})

test('another window terminates a busy worker and rejects what it owed', async () => {
  const { workers, draw } = layout()
  const a = draw(req(lpa), live())
  const b = draw(req(amy1), live())
  await assert.rejects(a, Superseded)
  assert.equal(workers[0]!.terminated, true)
  assert.equal(workers.length, 2)
  workers[1]!.reply({ id: workers[1]!.requests[0]!.id, result: drawn('b') })
  assert.deepEqual(await b, drawn('b'))
})

test('an abort terminates the worker with the signal reason', async () => {
  const { workers, draw } = layout()
  const abort = new AbortController()
  const a = draw(req(lpa), abort.signal)
  abort.abort(new DOMException('slow', 'TimeoutError'))
  await assert.rejects(a, { name: 'TimeoutError' })
  assert.equal(workers[0]!.terminated, true)
})

test('an abort reposts the requests still owed to a fresh worker', async () => {
  const { workers, draw } = layout()
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
  workers[0]!.reply({ id: workers[0]!.requests[0]!.id, result: drawn('a') })
  workers[1]!.reply({ id: workers[1]!.requests[0]!.id, result: drawn('b') })
  assert.deepEqual(await b, drawn('b'))
})

test('an abort after the reply leaves the worker running', async () => {
  const { workers, draw } = layout()
  const abort = new AbortController()
  const a = draw(req(lpa), abort.signal)
  workers[0]!.reply({ id: workers[0]!.requests[0]!.id, result: drawn('a') })
  assert.deepEqual(await a, drawn('a'))
  abort.abort()
  assert.equal(workers[0]!.terminated, false)
})

test('an aborted signal posts nothing', async () => {
  const { workers, draw } = layout()
  await assert.rejects(
    draw(req(lpa), AbortSignal.abort()),
    /AbortError|aborted/,
  )
  assert.equal(workers.length, 0)
})

test('a failed worker rejects what it owed and the next request starts another', async () => {
  const { workers, draw } = layout()
  const a = draw(req(lpa), live())
  workers[0]!.onerror?.({ message: 'boom' } as ErrorEvent)
  await assert.rejects(a, /boom/)
  assert.equal(workers[0]!.terminated, true)
  void draw(req(lpa), live())
  assert.equal(workers.length, 2)
})

const forms = (haplotype: string) => structuralForms([], [haplotype], 1)

test('one worker answers question after question', async () => {
  const { workers, ask } = walkFormsOf()
  const a = ask({ walksUrl: 'w', region: lpa })
  workers[0]!.reply({ id: workers[0]!.requests[0]!.id, result: forms('A#1') })
  assert.deepEqual(await a, forms('A#1'))
  const b = ask({ walksUrl: 'w', region: amy1 })
  workers[0]!.reply({ id: workers[0]!.requests[1]!.id, result: forms('B#1') })
  assert.deepEqual(await b, forms('B#1'))
  assert.equal(workers.length, 1)
  assert.equal(workers[0]!.terminated, false)
})

test('a failed read rejects its question and keeps the worker', async () => {
  const { workers, ask } = walkFormsOf()
  const a = ask({ walksUrl: 'w', region: lpa })
  workers[0]!.reply({
    id: workers[0]!.requests[0]!.id,
    error: { name: 'WalkFormsTooLarge', message: 'big', regionTooLarge: false },
  })
  await assert.rejects(a, { name: 'WalkFormsTooLarge' })
  assert.equal(workers[0]!.terminated, false)
})

test('an abort terminates the worker and reposts the rest to a fresh one', async () => {
  const { workers, ask } = walkFormsOf()
  const abort = new AbortController()
  const a = ask({ walksUrl: 'w', region: lpa }, abort.signal)
  const b = ask({ walksUrl: 'w', region: amy1 })
  abort.abort(new DOMException('dropped', 'AbortError'))
  await assert.rejects(a, { name: 'AbortError' })
  assert.equal(workers[0]!.terminated, true)
  assert.deepEqual(
    workers[1]!.requests.map(r => r.region),
    [amy1],
  )
  workers[1]!.reply({ id: workers[1]!.requests[0]!.id, result: forms('B#1') })
  assert.deepEqual(await b, forms('B#1'))
})

test('a question past its deadline is too slow, and the worker is replaced', async () => {
  const { workers, ask } = walkFormsOf(5)
  await assert.rejects(ask({ walksUrl: 'w', region: lpa }), {
    name: 'WalkFormsTooSlow',
  })
  assert.equal(workers[0]!.terminated, true)
  const b = ask({ walksUrl: 'w', region: amy1 })
  workers[1]!.reply({ id: workers[1]!.requests[0]!.id, result: forms('B#1') })
  assert.deepEqual(await b, forms('B#1'))
})

test('an aborted signal asks nothing', async () => {
  const { workers, ask } = walkFormsOf()
  await assert.rejects(
    ask({ walksUrl: 'w', region: lpa }, AbortSignal.abort()),
    { name: 'AbortError' },
  )
  assert.equal(workers.length, 0)
})

test('a region too large to cut survives the trip back', async () => {
  const tooLarge = Object.assign(new Error('Zoom in'), {
    name: 'NodeLimitError',
    regionTooLarge: true,
  })
  const { workers, draw } = layout()
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

test('an answer in time clears its deadline', async () => {
  const { workers, ask } = walkFormsOf(5)
  const a = ask({ walksUrl: 'w', region: lpa })
  workers[0]!.reply({ id: workers[0]!.requests[0]!.id, result: forms('A#1') })
  assert.deepEqual(await a, forms('A#1'))
  await new Promise(resolve => setTimeout(resolve, 20))
  assert.equal(workers[0]!.terminated, false)
  assert.equal(workers.length, 1)
})
